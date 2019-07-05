import {AbstractIterator} from 'abstract-leveldown';
import {QuizGraph} from 'curtiz-parse-markdown';
import {KeyToEbisu} from 'curtiz-quiz-planner'
import {flatten, partitionBy} from 'curtiz-utils';
import * as web from 'curtiz-web-db';
import leveljs from 'level-js';
import {LevelUp} from 'levelup';
import React, {useEffect, useReducer, useState} from 'react';
import ReactDOM from 'react-dom';

import {Edit} from './Edit';

const ce = React.createElement;
type Db = LevelUp<leveljs, AbstractIterator<any, any>>;

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

type GraphType = QuizGraph&KeyToEbisu;
let GRAPH: GraphType;
let DB: Db;

async function setup(): Promise<void> {
  DB = web.setup('testing');
  GRAPH = await web.initialize(DB, md);
  return;
}

function isRawLearned(raw: string, GRAPH: GraphType): boolean {
  const set = GRAPH.raws.get(raw);
  if (!set) { return false; }
  for (const key of set) {
    if (GRAPH.ebisus.has(key)) { return true; }
  }
  return false;
}

function isRawLearnable(raw: string, GRAPH: GraphType): boolean { return GRAPH.raws.has(raw); }

function Main() {
  const raws = flatten(blocks.map(block => block.map((line, lino) => block[0] + (lino ? '\n' + line : ''))));
  const lines = flatten(blocks);
  const learned = (x: string) => isRawLearned(x, GRAPH);
  const learnable = (x: string) => isRawLearnable(x, GRAPH);
  // console.log(Array.from(graph.raws.keys()));
  // console.log('lines', lines);
  // console.log('raws', raws);
  return ce('ul', null, lines.map((line, i) => {
    let v = [line, (learnable(raws[i]) ? (learned(raws[i]) ? ' [learned!] ' : ce('button', null, 'learn')) : '')];
    return ce('li', {key: i}, ...v);
  }));
}

setup().then(() => ReactDOM.render(ce(Edit, {db: DB, reloadCount: 0}), document.getElementById('root')));