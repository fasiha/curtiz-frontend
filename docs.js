"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function rehydrateDoc(nominalDoc) {
    if (nominalDoc.modified instanceof Date) {
        return nominalDoc;
    }
    nominalDoc.modified = new Date(nominalDoc.modified);
    return nominalDoc;
}
exports.DOCS_PREFIX = 'docs/';
function loadDocs(db, prefix) {
    var docs = new Map();
    return new Promise(function (resolve, reject) {
        db.createReadStream({ gt: prefix, lt: prefix + '\xff', valueAsBuffer: false, keyAsBuffer: false })
            .on('data', function (_a) {
            var key = _a.key, value = _a.value;
            return docs.set(key.slice(prefix.length), rehydrateDoc(value));
        })
            .on('close', function () { return resolve({ docs: docs }); })
            .on('error', function (err) { return reject(err); });
    });
}
exports.loadDocs = loadDocs;
function saveDoc(db, prefix, doc) { return db.put(prefix + doc.title, doc); }
exports.saveDoc = saveDoc;
