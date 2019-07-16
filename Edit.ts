import React, {useState} from 'react';

import {Doc} from './docs';

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

export function Edit(props: {docs: Doc[], updateDoc: (doc: Doc) => any}) {
  return ce('div', null, ...props.docs.map(doc => ce(EditableDoc, {doc, updateDoc: props.updateDoc})));
}
