import React, {useEffect, useReducer, useState} from 'react';

import {Db, Doc, Docs, DOCS_PREFIX, loadDocs, saveDoc} from './docs';

const ce = React.createElement;

function EditableDoc(props: {doc: Doc, db: Db}) {
  const [value, setValue] = useState(props.doc.content);
  return ce(
      'div',
      null,
      props.doc.title,
      ce('textarea', {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          // console.log('onChange', e);
          setValue(e.target.value)
        }
      }),
      ce('button', {
        onClick: (_: any) => {
          props.doc.content = value;
          props.doc.modified = new Date();
          saveDoc(props.db, DOCS_PREFIX, props.doc);
        }
      },
         'Submit'),
  )
}

export function Edit(props: {db: Db, reloadCount: number}) {
  const [docs, setDocs] = useState({docs: new Map()} as Docs)

  async function loader() {
    const ret = await loadDocs(props.db, DOCS_PREFIX);

    const date = new Date();
    const newName = 'New ' + date.toISOString();
    ret.docs.set(newName, {title: newName, content: '(empty)', source: undefined, modified: date});
    setDocs(ret);
  }
  useEffect(() => { loader(); }, [props.reloadCount]);

  const rv = [];
  for (const [title, doc] of docs.docs) { rv.push(ce(EditableDoc, {doc, db: props.db})); }
  return ce('div', null, ...rv);
}
