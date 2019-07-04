import {QuizGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu} from 'curtiz-quiz-planner'
import {flatten, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import React, {useEffect, useReducer, useState} from 'react';
import ReactDOM from 'react-dom';
const ce = React.createElement;

const md = `## @ 千と千尋の神隠し @ せんとちひろのかみがくし
- @fill と
- @fill の
- @ 千 @ せん    @pos noun-proper-name-firstname @omit [千]と
- @ 千尋 @ ちひろ    @pos noun-proper-name-firstname
- @ 神隠し @ かみがくし    @pos noun-common-general
- @translation @en Spirited Away (film)

Hi there!

## @ このおはなしに出て来る人びと @ このおはなしにでてくるひとびと
- @fill に
- @fill 出て来る @ でてくる
- @ 話 @ はなし    @pos noun-common-verbal_suru @omit はなし
- @ 出る @ でる    @pos verb-general @omit 出
- @ 来る @ くる    @pos verb-bound
- @ 人々 @ ひとびと    @pos noun-common-general @omit 人びと
Welcome!
## @ 湯婆婆 @ ゆばーば
- @ 湯婆婆 @ ゆばーば    @pos noun-proper-name-general
Yowup!
Yes!
*Howdy!*!
`;
function markdownToBlocks(md: string) {
  const re = /^#+\s+.+$/;
  const headers = partitionBy(md.split('\n'), s => re.test(s));
  return headers;
}
const blocks = markdownToBlocks(md);

let graph: QuizGraph&KeyToEbisu;

async function setup() {
  const db = web.setup('testing');
  graph = await web.initialize(db, md);
  return;
}

function Main() {
  const raws = flatten(blocks.map(block => block.map((line, lino) => block[0] + (lino ? '\n' + line : ''))));
  const lines = flatten(blocks);
  // console.log(Array.from(graph.raws.keys()));
  // console.log('lines', lines);
  // console.log('raws', raws);
  return ce('ul', null, lines.map((line, i) => ce('li', {key: i}, line + (graph.raws.has(raws[i]) ? ' XXX ' : ''))));
}

setup().then(() => ReactDOM.render(ce(Main), document.getElementById('root')));