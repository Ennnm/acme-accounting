import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';

import { Worker } from 'worker_threads';
import { createWriteStream } from 'fs';
import { promises as fsPromises } from 'fs';

interface WorkerResponse {
  error?: string;
  [key: string]: number | string | undefined;
}

@Injectable()
export class ReportsService {
  private states = {
    accounts: 'idle',
    yearly: 'idle',
    fs: 'idle',
  };

  private balanceSheetCategories = {
    'Income Statement': {
      Revenues: ['Sales Revenue'],
      Expenses: [
        'Cost of Goods Sold',
        'Salaries Expense',
        'Rent Expense',
        'Utilities Expense',
        'Interest Expense',
        'Tax Expense',
      ],
    },
    'Balance Sheet': {
      Assets: [
        'Cash',
        'Accounts Receivable',
        'Inventory',
        'Fixed Assets',
        'Prepaid Expenses',
      ],
      Liabilities: [
        'Accounts Payable',
        'Loan Payable',
        'Sales Tax Payable',
        'Accrued Liabilities',
        'Unearned Revenue',
        'Dividends Payable',
      ],
      Equity: ['Common Stock', 'Retained Earnings'],
    },
  };

  state(scope: string) {
    return this.states[scope];
  }

  accounts() {
    this.states.accounts = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/accounts.csv';
    const accountBalances: Record<string, number> = {};
    fs.readdirSync(tmpDir).forEach((file) => {
      if (file.endsWith('.csv')) {
        const lines = fs
          .readFileSync(path.join(tmpDir, file), 'utf-8')
          .trim()
          .split('\n');
        for (const line of lines) {
          const [, account, , debit, credit] = line.split(',');
          if (!accountBalances[account]) {
            accountBalances[account] = 0;
          }
          accountBalances[account] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      }
    });
    const output = ['Account,Balance'];
    for (const [account, balance] of Object.entries(accountBalances)) {
      output.push(`${account},${balance.toFixed(2)}`);
    }
    fs.writeFileSync(outputFile, output.join('\n'));
    this.states.accounts = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
  }

  async asyncAccounts() {
    this.states.accounts = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/accounts.csv';

    // Get list of CSV files and split into chunks for parallel processing
    const files = (await fsPromises.readdir(tmpDir)).filter((file) =>
      file.endsWith('.csv'),
    );
    const chunks = this.splitIntoChunks(files, 4); // Process in 4 parallel chunks

    // Process chunks in parallel using worker threads
    const results = await Promise.all(
      chunks.map((chunk) => this.processAccountChunkWithWorker(chunk, tmpDir)),
    );

    // Merge results from all workers
    const accountBalances = this.mergeResults(results);

    // Write results using streams
    await this.writeAccountResultsToFile(accountBalances, outputFile);

    this.states.accounts = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    return accountBalances;
  }

  private splitIntoChunks(array: string[], chunks: number): string[][] {
    const chunkSize = Math.ceil(array.length / chunks);
    return Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
      array.slice(i * chunkSize, (i + 1) * chunkSize),
    );
  }

  private processAccountChunkWithWorker(
    files: string[],
    tmpDir: string,
  ): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        const { createReadStream } = require('fs');
        const { createInterface } = require('readline');
        const path = require('path');

        async function processFiles(files, tmpDir) {
          const balances = {};

          for (const file of files) {
            const fileStream = createReadStream(path.join(tmpDir, file));
            const rl = createInterface({ input: fileStream });

            for await (const line of rl) {
              const [, account, , debit, credit] = line.split(',');
              balances[account] = (balances[account] || 0) +
                parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
            }
          }
          return balances;
        }

        parentPort.on('message', async ({ files, tmpDir }) => {
          try {
            const result = await processFiles(files, tmpDir);
            parentPort.postMessage(result);
          } catch (error) {
            parentPort.postMessage({ error: error.message });
          }
        });
      `,
        { eval: true },
      );

      worker.postMessage({ files, tmpDir });
      worker.on('message', (result: WorkerResponse) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result as Record<string, number>);
        }
        worker.terminate();
      });
      worker.on('error', reject);
    });
  }

  private processYearlyChunkWithWorker(
    files: string[],
    tmpDir: string,
  ): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        const { createReadStream } = require('fs');
        const { createInterface } = require('readline');
        const path = require('path');

        async function processFiles(files, tmpDir) {
          const cashByYear = {};

          for (const file of files) {
            const fileStream = createReadStream(path.join(tmpDir, file));
            const rl = createInterface({ input: fileStream });

            for await (const line of rl) {
              const [date, account, , debit, credit] = line.split(',');
              if (account === 'Cash') {
                const year = new Date(date).getFullYear();
                if (!cashByYear[year]) {
                  cashByYear[year] = 0;
                }
                cashByYear[year] +=
                  parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
              }
            }
          }
          return cashByYear;
        }

        parentPort.on('message', async ({ files, tmpDir }) => {
          try {
            const result = await processFiles(files, tmpDir);
            parentPort.postMessage(result);
          } catch (error) {
            parentPort.postMessage({ error: error.message });
          }
        });
      `,
        { eval: true },
      );

      worker.postMessage({ files, tmpDir });
      worker.on('message', (result: WorkerResponse) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result as Record<string, number>);
        }
        worker.terminate();
      });
      worker.on('error', reject);
    });
  }

  private processFsChunkWithWorker(
    files: string[],
    tmpDir: string,
    categories: Record<string, Record<string, string[]>>,
  ): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        `
        const { parentPort } = require('worker_threads');
        const { createReadStream } = require('fs');
        const { createInterface } = require('readline');
        const path = require('path');

        async function processFiles(files, tmpDir, balance) {
          for (const file of files) {
            const fileStream = createReadStream(path.join(tmpDir, file));
            const rl = createInterface({ input: fileStream });

            for await (const line of rl) {
              const [, account, , debit, credit] = line.split(',');
              if (balance.hasOwnProperty(account)) {
                balance[account] +=
                  parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
              }
            }
          }
          return balance;
        }

        parentPort.on('message', async ({ files, tmpDir, balance }) => {
          try {
            const result = await processFiles(files, tmpDir, balance);
            parentPort.postMessage(result);
          } catch (error) {
            parentPort.postMessage({ error: error.message });
          }
        });
      `,
        { eval: true },
      );
      const balance = this.createEmptyBalanceSheet(categories);
      worker.postMessage({ files, tmpDir, balance });
      worker.on('message', (result: WorkerResponse) => {
        if (result.error) {
          reject(new Error(result.error));
        } else {
          resolve(result as Record<string, number>);
        }
        worker.terminate();
      });
      worker.on('error', reject);
    });
  }

  private mergeResults(
    results: Record<string, number>[],
  ): Record<string, number> {
    return results.reduce((total, curr) => {
      for (const [key, val] of Object.entries(curr)) {
        total[key] = (total[key] || 0) + val;
      }
      return total;
    }, {});
  }

  private async writeAccountResultsToFile(
    accountBalances: Record<string, number>,
    outputFile: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = createWriteStream(outputFile);
      writeStream.write('Account,Balance\n');

      for (const [account, balance] of Object.entries(accountBalances)) {
        writeStream.write(`${account},${balance.toFixed(2)}\n`);
      }

      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }
  private async writeLinesToFile(
    header: string,
    lines: string[],
    outputFile: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = createWriteStream(outputFile);
      writeStream.write(`${header}\n`);
      for (const l of lines) {
        writeStream.write(`${l}\n`);
      }
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  yearly() {
    this.states.yearly = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/yearly.csv';
    const cashByYear: Record<string, number> = {};
    fs.readdirSync(tmpDir).forEach((file) => {
      if (file.endsWith('.csv') && file !== 'yearly.csv') {
        const lines = fs
          .readFileSync(path.join(tmpDir, file), 'utf-8')
          .trim()
          .split('\n');
        for (const line of lines) {
          const [date, account, , debit, credit] = line.split(',');
          if (account === 'Cash') {
            const year = new Date(date).getFullYear();
            if (!cashByYear[year]) {
              cashByYear[year] = 0;
            }
            cashByYear[year] +=
              parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
          }
        }
      }
    });
    const output = ['Financial Year,Cash Balance'];
    Object.keys(cashByYear)
      .sort()
      .forEach((year) => {
        output.push(`${year},${cashByYear[year].toFixed(2)}`);
      });
    fs.writeFileSync(outputFile, output.join('\n'));
    this.states.yearly = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
  }
  async asyncYearly() {
    this.states.yearly = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/yearly.csv';
    const files = (await fsPromises.readdir(tmpDir)).filter(
      (file) => file.endsWith('.csv') && file !== 'yearly.csv',
    );
    const chunks = this.splitIntoChunks(files, 4); // Process in 4 parallel chunks

    const results = await Promise.all(
      chunks.map((chunk) => this.processYearlyChunkWithWorker(chunk, tmpDir)),
    );

    // Merge results from all workers
    const cashByYear = this.mergeResults(results);
    const output: string[] = [];
    Object.keys(cashByYear)
      .sort()
      .forEach((year) => {
        output.push(`${year},${cashByYear[year].toFixed(2)}`);
      });
    await this.writeLinesToFile(
      'Financial Year,Cash Balance',
      output,
      outputFile,
    );
    this.states.yearly = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
  }

  createEmptyBalanceSheet(
    categories: Record<string, Record<string, string[]>>,
  ) {
    const balances: Record<string, number> = {};
    for (const section of Object.values(categories)) {
      for (const group of Object.values(section)) {
        for (const account of group) {
          balances[account] = 0;
        }
      }
    }
    return balances;
  }

  generateLinesFromBalanceSheet(
    balances: Record<string, number>,
    categories: Record<string, Record<string, string[]>>,
  ) {
    const output: string[] = [];
    output.push('');
    output.push('Income Statement');
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const account of categories['Income Statement']['Revenues']) {
      const value = balances[account] || 0;
      output.push(`${account},${value.toFixed(2)}`);
      totalRevenue += value;
    }
    for (const account of categories['Income Statement']['Expenses']) {
      const value = balances[account] || 0;
      output.push(`${account},${value.toFixed(2)}`);
      totalExpenses += value;
    }
    output.push(`Net Income,${(totalRevenue - totalExpenses).toFixed(2)}`);
    output.push('');
    output.push('Balance Sheet');
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    output.push('Assets');
    for (const account of categories['Balance Sheet']['Assets']) {
      const value = balances[account] || 0;
      output.push(`${account},${value.toFixed(2)}`);
      totalAssets += value;
    }
    output.push(`Total Assets,${totalAssets.toFixed(2)}`);
    output.push('');
    output.push('Liabilities');
    for (const account of categories['Balance Sheet']['Liabilities']) {
      const value = balances[account] || 0;
      output.push(`${account},${value.toFixed(2)}`);
      totalLiabilities += value;
    }
    output.push(`Total Liabilities,${totalLiabilities.toFixed(2)}`);
    output.push('');
    output.push('Equity');
    for (const account of categories['Balance Sheet']['Equity']) {
      const value = balances[account] || 0;
      output.push(`${account},${value.toFixed(2)}`);
      totalEquity += value;
    }
    output.push(
      `Retained Earnings (Net Income),${(totalRevenue - totalExpenses).toFixed(2)}`,
    );
    totalEquity += totalRevenue - totalExpenses;
    output.push(`Total Equity,${totalEquity.toFixed(2)}`);
    output.push('');
    output.push(
      `Assets = Liabilities + Equity, ${totalAssets.toFixed(2)} = ${(totalLiabilities + totalEquity).toFixed(2)}`,
    );
    return output;
  }

  async asyncFs() {
    this.states.fs = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/fs.csv';
    const categories = this.balanceSheetCategories;
    const files = (await fsPromises.readdir(tmpDir)).filter(
      (file) => file.endsWith('.csv') && file !== 'fs.csv',
    );
    const chunks = this.splitIntoChunks(files, 4); // Process in 4 parallel chunks

    // Process chunks in parallel using worker threads
    const results = await Promise.all(
      chunks.map((chunk) =>
        this.processFsChunkWithWorker(chunk, tmpDir, categories),
      ),
    );

    // Merge results from all workers
    const balances = this.mergeResults(results);

    const output = this.generateLinesFromBalanceSheet(balances, categories);
    await this.writeLinesToFile(
      'Basic Financial Statement',
      output,
      outputFile,
    );
    this.states.fs = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
  }

  fs() {
    this.states.fs = 'starting';
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = 'out/fs.csv';
    const categories = this.balanceSheetCategories;
    const balances = this.createEmptyBalanceSheet(categories);

    fs.readdirSync(tmpDir).forEach((file) => {
      if (file.endsWith('.csv') && file !== 'fs.csv') {
        const lines = fs
          .readFileSync(path.join(tmpDir, file), 'utf-8')
          .trim()
          .split('\n');

        for (const line of lines) {
          const [, account, , debit, credit] = line.split(',');

          if (balances.hasOwnProperty(account)) {
            balances[account] +=
              parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
          }
        }
      }
    });
    const output = [
      'Basic Financial Statement',
      ...this.generateLinesFromBalanceSheet(balances, categories),
    ];
    fs.writeFileSync(outputFile, output.join('\n'));
    this.states.fs = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
  }
}
