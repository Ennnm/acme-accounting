const { parentPort } = require('worker_threads');
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');

async function processFiles(files, tmpDir, balance) {
  for (const file of files) {
    const fileStream = createReadStream(path.join(tmpDir, file));
    const rl = createInterface({ input: fileStream });
    try {
      for await (const line of rl) {
        const [, account, , debit, credit] = line.split(',');
        if (balance.hasOwnProperty(account)) {
          balance[account] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      }
    } finally {
      rl.close();
      fileStream.destroy();
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
  } finally {
    parentPort.close();
  }
});
