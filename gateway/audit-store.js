const fs = require("node:fs/promises");
const path = require("node:path");

function createAuditStore(logFile) {
  async function appendAudit(entry) {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf8");
  }

  async function readAuditEntries(limit = 250) {
    try {
      const content = await fs.readFile(logFile, "utf8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(-limit)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  return { appendAudit, readAuditEntries };
}

module.exports = { createAuditStore };
