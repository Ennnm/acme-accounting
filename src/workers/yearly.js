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
