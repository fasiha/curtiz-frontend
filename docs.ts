import {AbstractIterator} from 'abstract-leveldown';
import {EventBase} from 'curtiz-web-db';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';

export type Db = LevelUp<leveljs, AbstractIterator<any, any>>;
export type DocSource = {
  type: 'manual',
  created: Date
};
export type Doc = {
  title: string,
  content: string,
  source: DocSource,
  modified: Date,
};

export function docToStorageKey(doc: Doc, prefix: string) {
  // eventually this will do something with the other sources
  return prefix + doc.source.created.toISOString();
}

function rehydrateDoc(nominalDoc: Doc) {
  if (nominalDoc.modified instanceof Date && nominalDoc.source.created instanceof Date) { return nominalDoc; }
  nominalDoc.modified = new Date(nominalDoc.modified);
  nominalDoc.source.created = new Date(nominalDoc.source.created);
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
  // need to ensure this lexsorts LAST: possible you've sync'd an event at the exact same date, and this uid lexsorts
  // before that one. FIXME
  const eventValue: EventDoc = {doc, uid, action: 'doc', date};

  return db.batch([
    {type: 'put', key: docToStorageKey(doc, prefix), value: doc},
    {type: 'put', key: eventPrefix + uid, value: eventValue},
  ]);
}
