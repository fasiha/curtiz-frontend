import {AbstractIterator} from 'abstract-leveldown';
import {EventBase} from 'curtiz-web-db';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';

export type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
export type Doc = {
  title: string,
  content: string,
  source: any,
  modified: Date,
};

function rehydrateDoc(nominalDoc: Doc) {
  if (nominalDoc.modified instanceof Date) { return nominalDoc; }
  nominalDoc.modified = new Date(nominalDoc.modified);
  return nominalDoc;
}

export const DOCS_PREFIX = 'docs/';
export function loadDocs(db: Db, prefix: string): Promise<Doc[]> {
  let docs: Doc[] = [];
  return new Promise((resolve, reject) => {
    db.createValueStream({gt: prefix, lt: prefix + '\xff', valueAsBuffer: false, keyAsBuffer: false})
        .on('data', value => docs.push(rehydrateDoc(value)))
        .on('close', () => resolve(docs))
        .on('error', err => reject(err));
  });
}
export interface EventDoc extends EventBase {
  doc: Doc;
  action: 'doc';
}
export function saveDoc(db: Db, prefix: string, eventPrefix: string, doc: Doc,
                        opts: {date?: Date} = {}): Promise<void> {
  const date = opts.date || new Date();

  const uid = `${date.toISOString()}-${Math.random().toString(36).slice(2)}-doc`;
  // need to ensure this lexsorts LAST. FIXME

  const eventValue: EventDoc = {doc, uid, action: 'doc', date: new Date()};
  return db.batch([
    {type: 'put', key: prefix + doc.title, value: doc},
    {type: 'put', key: eventPrefix + uid, value: eventValue},
  ]);
}
