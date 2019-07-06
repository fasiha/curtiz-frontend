import React, {useEffect, useReducer, useState} from 'react';

import {Db, Doc, Docs, DOCS_PREFIX, loadDocs, saveDoc} from './docs';

const ce = React.createElement;

function EditableDoc(props: {doc: Doc, updateDoc: (doc: Doc) => any}) {
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
          props.updateDoc(props.doc);
        }
      },
         'Submit'),
  )
}

export function Edit(props: {docs: Docs, updateDoc: (doc: Doc) => any}) {
  const rv = [];
  for (const doc of props.docs.docs.values()) { rv.push(ce(EditableDoc, {doc, updateDoc: props.updateDoc})); }
  return ce('div', null, ...rv);
}
