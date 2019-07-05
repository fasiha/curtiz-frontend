import {AbstractIterator} from 'abstract-leveldown';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';

export type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
export type Doc = {
  title: string,
  content: string,
  source: any,
  modified: Date,
};
export type Docs = {
  docs: Map<string, Doc>
};

function rehydrateDoc(nominalDoc: Doc) {
  if (nominalDoc.modified instanceof Date) { return nominalDoc; }
  nominalDoc.modified = new Date(nominalDoc.modified);
  return nominalDoc;
}

export const DOCS_PREFIX: string = 'docs/';
export function loadDocs(db: Db, prefix: string): Promise<Docs> {
  let docs: Map<string, Doc> = new Map();
  return new Promise((resolve, reject) => {
    db.createReadStream({gt: prefix, lt: prefix + '\xff', valueAsBuffer: false, keyAsBuffer: false})
        .on('data', ({key, value}) => docs.set(key.slice(prefix.length), rehydrateDoc(value)))
        .on('close', () => resolve({docs}))
        .on('error', err => reject(err));
  });
}

export function saveDoc(db: Db, prefix: string, doc: Doc): Promise<void> { return db.put(prefix + doc.title, doc); }
