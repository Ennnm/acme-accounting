const { parentPort } = require('worker_threads');
const { createReadStream } = require('fs');
const { createInterface } = require('readline');
const path = require('path');

async function processFiles(files, tmpDir) {
  const balances = {};

  for (const file of files) {
    const fileStream = createReadStream(path.join(tmpDir, file));
    const rl = createInterface({ input: fileStream });
    try {
      for await (const line of rl) {
        const [, account, , debit, credit] = line.split(',');
        balances[account] =
          (balances[account] || 0) +
          parseFloat(String(debit || 0)) -
          parseFloat(String(credit || 0));
      }
    } finally {
      rl.close();
      fileStream.destroy();
    }
    return balances;
  }
}

parentPort.on('message', async ({ files, tmpDir }) => {
  try {
    const result = await processFiles(files, tmpDir);
    parentPort.postMessage(result);
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  } finally {
    parentPort.close();
  }
});
