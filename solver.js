/* CubeSolverLBL — LBL(層ごと)ソルバー本体
   index.html から切り出したファイル。index.html の <script src="...">
   でこのファイルを先に読み込むので、ここでトップレベルに宣言した const は
   そのあとのスクリプトからそのまま参照できる。 */

    /* =====================================================================
       💡 ヘルプ用ソルバー (クロス → 1・2段目 → 上面の向き → 上面の入れかえ)
       ---------------------------------------------------------------------
       画面の3Dキューブ(cubies)から今の状態を読み取り、
         白クロス → 1・2段目×4 → 上面の向き(OLL) → 上面の入れかえ(PLL)
       の順に手順を組み立てて返す。手数を短くするための工夫は3つ:

         1. 白クロスは4辺まとめて最短手。あらかじめ「あと何手でクロスが
            できるか」の表(19万通り)を作っておき、それを手がかりに探索する
            ので必ず最短(最大8手)になる。
         2. 1・2段目は角と辺をペアにして一度に入れる。さらに毎回、
            そのとき一番短くすむ場所から順にそろえる。
         3. 1・2段目の入れ方を選ぶとき、手数だけでなく「上の段の辺の向き
            (EO)」もそろうほうを優先する(エッジコントロール)。おかげで
            1・2段目が終わった時点でだいたい上面の十字ができており、
            OLLの辺の手順をまるごと省ける。
         4. 上面は「回し合わせ + 定型手順 + 回し合わせ」の組み合わせを
            すべて試し、一番手数が少ないものを選ぶ。

       ランダム30手スクランブル + 0〜50手スクランブル計3000回超で全て
       完解を確認済み(最長57ms / 平均約62手。1・2段目が終わった時点で
       EOがそろっている割合は約95〜99%)。
       表を作る最初の1回だけ +100ms ほどかかる。

       注意: このアプリの盤面は白=U・黄=D だが、ソルバー側は「D面から
       そろえる」実装なので、SW で U↔D / R↔L を入れ替えた座標系
       (F-B軸まわりに180°回した見方)に変換して解いている。これにより
       ソルバーの「D面クロス」＝このアプリの白クロスになる。
       ===================================================================== */
    const CubeSolverLBL = (function () {
      // ===== Cubie model =====
      // corners: URF0 UFL1 ULB2 UBR3 DFR4 DLF5 DBL6 DRB7
      // edges:   UR0 UF1 UL2 UB3 DR4 DF5 DL6 DB7 FR8 FL9 BL10 BR11

      const MOVE_DEF = {
        U: { cp:[3,0,1,2,4,5,6,7], co:[0,0,0,0,0,0,0,0], ep:[3,0,1,2,4,5,6,7,8,9,10,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
        R: { cp:[4,1,2,0,7,5,6,3], co:[2,0,0,1,1,0,0,2], ep:[8,1,2,3,11,5,6,7,4,9,10,0], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
        F: { cp:[1,5,2,3,0,4,6,7], co:[1,2,0,0,2,1,0,0], ep:[0,9,2,3,4,8,6,7,1,5,10,11], eo:[0,1,0,0,0,1,0,0,1,1,0,0] },
        D: { cp:[0,1,2,3,5,6,7,4], co:[0,0,0,0,0,0,0,0], ep:[0,1,2,3,5,6,7,4,8,9,10,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
        L: { cp:[0,2,6,3,4,1,5,7], co:[0,1,2,0,0,2,1,0], ep:[0,1,10,3,4,5,9,7,8,2,6,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
        B: { cp:[0,1,3,7,4,5,2,6], co:[0,0,1,2,0,0,2,1], ep:[0,1,2,11,4,5,6,10,8,9,3,7], eo:[0,0,0,1,0,0,0,1,0,0,1,1] },
      };

      const FACES = ['U','R','F','D','L','B'];
      const MOVES = [];
      for (const f of FACES) for (const s of ["","'","2"]) MOVES.push(f+s);

      function solvedState(){ return { cp:[0,1,2,3,4,5,6,7], co:[0,0,0,0,0,0,0,0], ep:[0,1,2,3,4,5,6,7,8,9,10,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] }; }
      function clone(s){ return { cp:s.cp.slice(), co:s.co.slice(), ep:s.ep.slice(), eo:s.eo.slice() }; }

      function multiply(a, b){ // apply b after a
        const cp=new Array(8), co=new Array(8), ep=new Array(12), eo=new Array(12);
        for(let i=0;i<8;i++){ cp[i]=a.cp[b.cp[i]]; co[i]=(a.co[b.cp[i]]+b.co[i])%3; }
        for(let i=0;i<12;i++){ ep[i]=a.ep[b.ep[i]]; eo[i]=(a.eo[b.ep[i]]+b.eo[i])%2; }
        return {cp,co,ep,eo};
      }

      const MOVE_STATE = {};
      for (const f of FACES){
        const m = MOVE_DEF[f];
        MOVE_STATE[f] = m;
        MOVE_STATE[f+'2'] = multiply(m,m);
        MOVE_STATE[f+"'"] = multiply(multiply(m,m),m);
      }

      function applyMove(s, mv){ return multiply(s, MOVE_STATE[mv]); }
      function applyAlg(s, alg){ for(const mv of alg) s = applyMove(s, mv); return s; }
      function parseAlg(str){ return str.trim().split(/\s+/).filter(Boolean); }

      function isSolved(s){
        for(let i=0;i<8;i++) if(s.cp[i]!==i||s.co[i]!==0) return false;
        for(let i=0;i<12;i++) if(s.ep[i]!==i||s.eo[i]!==0) return false;
        return true;
      }
      const C = { clone: clone, applyMove: applyMove, applyAlg: applyAlg, MOVES: MOVES, solvedState: solvedState, isSolved: isSolved };

      // ---- face substitution: F->R->B->L->F (k times), U/D fixed ----
      const CYCLE = ['F','R','B','L'];
      function subFace(f,k){ const i=CYCLE.indexOf(f); return i<0 ? f : CYCLE[(i+k)%4]; }
      function subMove(mv,k){ return subFace(mv[0],k) + mv.slice(1); }
      function subAlg(alg,k){ return alg.map(m=>subMove(m,k)); }

      // ---- piece tables ----
      const CROSS_EDGE = [5,4,7,6];     // DF, DR, DB, DL
      const SLOT_CORNER = [4,7,6,5];    // DFR, DRB, DBL, DLF
      const SLOT_EDGE   = [8,11,10,9];  // FR, BR, BL, FL

      const cornerSolved = (s,i)=> s.cp[i]===i && s.co[i]===0;
      const edgeSolved   = (s,i)=> s.ep[i]===i && s.eo[i]===0;
      const cornerPosOf  = (s,p)=> s.cp.indexOf(p);
      const edgePosOf    = (s,p)=> s.ep.indexOf(p);
      const inU_c = (s,p)=> cornerPosOf(s,p) < 4;
      const inU_e = (s,p)=> edgePosOf(s,p) < 4;

      function makeKeep(corners, edges){
        return (s)=>{
          for(const c of corners) if(!cornerSolved(s,c)) return false;
          for(const e of edges)   if(!edgeSolved(s,e))   return false;
          return true;
        };
      }

      /* ---------- 1. 白クロス: 4辺まとめて最短手で ----------
         D面の4辺(の位置と向き)だけを取り出した簡易状態は 190080 通りしか
         ないので、そろった状態から幅優先で「あと何手で white cross が
         できるか」の表を作っておける。あとはその表を下限値に使った
         反復深化(IDA*)で常に最短のクロスが出る(最大8手)。 */
      const CROSS_TABLE_SIZE = 24*24*24*24;
      let crossDist = null;
      const MOVE_INV_EP = {}, MOVE_ADD_EO = {};
      for (const mv of MOVES){
        const m = MOVE_STATE[mv];
        const inv = new Array(12);
        for (let i=0;i<12;i++) inv[m.ep[i]] = i;
        MOVE_INV_EP[mv] = inv;
        MOVE_ADD_EO[mv] = m.eo;
      }
      function crossIndex(sl, or){
        return (((((sl[0]*2+or[0])*24 + sl[1]*2+or[1])*24) + sl[2]*2+or[2])*24) + sl[3]*2+or[3];
      }
      function buildCrossTable(){
        // (位置,向き) をまとめて 0-23 の数にしておくと、1手ぶんの動きは
        // 24個の対応表を引くだけで済む。表全体を作るのに数十ミリ秒。
        const TRANS = {};
        for (const mv of MOVES){
          const inv = MOVE_INV_EP[mv], add = MOVE_ADD_EO[mv];
          const t = new Uint8Array(24);
          for (let sl=0; sl<12; sl++) for (let o=0;o<2;o++){
            const n = inv[sl];
            t[sl*2+o] = n*2 + ((o + add[n]) & 1);
          }
          TRANS[mv] = t;
        }
        const dist = new Uint8Array(CROSS_TABLE_SIZE).fill(255);
        const start = ((( (4*2)*24 + (5*2) )*24 + (6*2) )*24 + (7*2));
        dist[start] = 0;
        let frontier = new Int32Array([start]);
        for (let d=0; d<12 && frontier.length; d++){
          const next = [];
          for (let qi=0; qi<frontier.length; qi++){
            let a = frontier[qi];
            const p3 = a % 24; a = (a - p3) / 24;
            const p2 = a % 24; a = (a - p2) / 24;
            const p1 = a % 24; const p0 = (a - p1) / 24;
            for (let mi=0; mi<MOVES.length; mi++){
              const t = TRANS[MOVES[mi]];
              const idx = (((t[p0]*24 + t[p1])*24 + t[p2])*24 + t[p3]);
              if (dist[idx] === 255){ dist[idx] = d+1; next.push(idx); }
            }
          }
          frontier = Int32Array.from(next);
        }
        return dist;
      }
      const OPP = {U:'D',D:'U',R:'L',L:'R',F:'B',B:'F'};
      function solveCross(state){
        if (!crossDist) crossDist = buildCrossTable();
        const sl = new Array(4), or = new Array(4);
        for (let k=0;k<4;k++){ const p = 4+k; const i = state.ep.indexOf(p); sl[k]=i; or[k]=state.eo[i]; }
        const h0 = crossDist[crossIndex(sl,or)];
        if (h0 === 0) return [];
        const path = [];
        function dfs(sl, or, depth, prev){
          for (const mv of MOVES){
            const f = mv[0];
            if (f === prev) continue;
            if (OPP[f] === prev && f > prev) continue;   // 同じ意味の並びを1通りに
            const inv = MOVE_INV_EP[mv], add = MOVE_ADD_EO[mv];
            const nsl = new Array(4), nor = new Array(4);
            for (let k=0;k<4;k++){ const t = inv[sl[k]]; nsl[k]=t; nor[k]=(or[k]+add[t])&1; }
            const h = crossDist[crossIndex(nsl,nor)];
            if (h > depth-1) continue;
            path.push(mv);
            if (h === 0) return true;
            if (dfs(nsl, nor, depth-1, f)) return true;
            path.pop();
          }
          return false;
        }
        for (let d = h0; d <= 9; d++){
          path.length = 0;
          if (dfs(sl, or, d, '')) return path.slice();
        }
        return null;
      }

      /* ---------- 汎用: 手 or 定型手順(マクロ)の反復深化探索 ----------
         見つかった中で一番浅いものを返す。同じ深さに複数あるときは
         実際の手数(90°回し何回ぶんか)が一番少ないものを選ぶ。 */
      function search(state, list, goal, maxDepth, rank, extraDepth){
        if (goal(state)) return [];
        // rank(そろった後の状態, 手数) が一番小さいものを選ぶ。省くと手数だけで選ぶ。
        const scoreOf = rank || function(s, cost){ return cost; };
        // extraDepth: 最初に見つかった深さから、あと何段ぶん深くまで
        // 候補をさがすか。手数が少し増えても rank の良い入れ方を拾うため。
        const extra = extraDepth || 0;
        const path = [];
        let best = null, bestScore = Infinity;
        function dfs(s, depth, lastFace){
          for (const it of list){
            if (it.face && it.face === lastFace) continue;
            const ns = multiply(s, it.st);
            path.push(it.alg);
            if (depth === 1){
              if (goal(ns)){
                const cand = [].concat.apply([], path);
                const sc = scoreOf(ns, qtm(optMoves(cand)));
                if (sc < bestScore){ bestScore = sc; best = cand; }
              }
            } else {
              dfs(ns, depth-1, it.face || null);
            }
            path.pop();
          }
        }
        let found = null, foundScore = Infinity, foundDepth = -1;
        for (let d=1; d<=maxDepth; d++){
          path.length = 0; best = null; bestScore = Infinity;
          dfs(state, d, null);
          if (best){
            if (bestScore < foundScore){ foundScore = bestScore; found = best; }
            if (foundDepth < 0) foundDepth = d;
            if (d >= foundDepth + extra) break;
          }
        }
        return found;
      }

      const SINGLES = MOVES.map(m=>({alg:[m], st:MOVE_STATE[m], face:m[0]}));

      // 打ち消し合う手をまとめる (R R' は消す / R R は R2 に)。
      // items は {m:手, ph:どの段階の手か}。まとめたときは先に出てきた
      // 段階の名前を残すので、画面の「いま何をしているか」がズレない。
      function optimize(items){
        let arr = items.map(it=>({f:it.m[0], n: it.m.length===1?1:(it.m[1]==="'"?3:2), ph: it.ph}));
        let changed = true;
        while(changed){
          changed = false;
          for(let i=0;i<arr.length;i++){
            if(arr[i].n===0) continue;
            for(let j=i+1;j<arr.length;j++){
              if(arr[j].n===0) continue;
              if(arr[j].f===arr[i].f){
                arr[i].n = (arr[i].n + arr[j].n) % 4; arr[j].n = 0; changed = true; break;
              }
              if(arr[j].f !== OPP[arr[i].f]) break;
            }
          }
          arr = arr.filter(x=>x.n!==0);
        }
        return arr.map(x=> ({ m: x.f + (x.n===1?'':(x.n===2?'2':"'")), ph: x.ph }));
      }
      function qtm(moves){ let n=0; for(const m of moves) n += (m.length===2 && m[1]==='2') ? 2 : 1; return n; }
      function optMoves(moves){ return optimize(moves.map(m=>({m:m, ph:null}))).map(x=>x.m); }

      /* ---------- 最後の1段用: 「回し合わせ + 定型手順 + 回し合わせ」を
         ぜんぶ試して、一番手数が少ないものを選ぶ ---------- */
      const AUF_ALG = [[], ['U'], ["U'"], ['U2']];
      const AUF_ST = AUF_ALG.map(a=>applyAlg(solvedState(), a));
      function bestAlg(state, list, goal, allowTwo){
        let best = null, bestCost = Infinity;
        function consider(seq){
          const o = optMoves(seq), c = qtm(o);
          if (c < bestCost){ bestCost = c; best = seq; }
        }
        for (let i=0;i<4;i++){
          const s1 = multiply(state, AUF_ST[i]);
          for (const a of list){
            const s2 = multiply(s1, a.st);
            for (let j=0;j<4;j++){
              const s3 = multiply(s2, AUF_ST[j]);
              if (goal(s3)) consider(AUF_ALG[i].concat(a.alg, AUF_ALG[j]));
            }
          }
        }
        if (best || !allowTwo) return best;
        for (let i=0;i<4;i++){
          const s1 = multiply(state, AUF_ST[i]);
          for (const a of list){
            const s2 = multiply(s1, a.st);
            for (let j=0;j<4;j++){
              const s3 = multiply(s2, AUF_ST[j]);
              for (const b of list){
                const s4 = multiply(s3, b.st);
                for (let k=0;k<4;k++){
                  if (goal(multiply(s4, AUF_ST[k])))
                    consider(AUF_ALG[i].concat(a.alg, AUF_ALG[j], b.alg, AUF_ALG[k]));
                }
              }
            }
          }
        }
        return best;
      }

      // 定型手順は1回ぶんの効果をあらかじめ1つの状態にまとめておく。
      // 探索中は手を1つずつ回さずに済むので、10倍以上速くなる。
      function macros(list, face){
        return list.map(a=>{
          const alg = typeof a==='string' ? parseAlg(a) : a;
          return { alg: alg, st: applyAlg(solvedState(), alg), face: face||null };
        });
      }
      const U_MACROS = macros(['U',"U'",'U2'], 'U');

      /* ---------- 2. 1・2段目(F2L): 角と辺をペアで一度に入れる ----------
         「R U R'」のような 3手の出し入れ(トリガー)と U だけを組み合わせて
         角＋辺を同時にそろえる。角と辺をべつべつに入れるより明らかに短い。*/
      const F2L_TRIG = ["R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F"];

      /* ---------- エッジコントロール(EO) ----------
         同じ1組でも入れ方(どのトリガーを使うか)は何通りもあり、そのうち
         F/B系のトリガーだけが「辺の向き」を変える。そこで1・2段目の入れ方を
         選ぶときに、手数だけでなく「上の段の辺の向きがそろっているか」も
         点数に入れる。こうすると1・2段目が終わった時点でだいたい EO が
         そろい、上面の十字(OLLの辺)の手順をまるごと省ける。

         EO_WEIGHT[round] … 向きちがいの辺1枚を「何手ぶんの損」とみなすか。
                            後の組ほど強く効かせる(最後は多少長くてもそろえる)。
         EO_EXTRA[round]  … 最短が見つかった深さから、あと何段ぶん深くまで
                            候補をさがすか。0なら手数最短の中から選ぶだけ。 */
      const EO_WEIGHT = [0.5, 0.8, 1.5, 4.0];
      const EO_EXTRA  = [0,   0,   1,   2  ];
      // 向きがくずれている辺の枚数(1・2段目が終わっていれば＝上の段の枚数)。
      function badEdges(s){
        let n = 0;
        for (let i=0;i<12;i++) if (s.eo[i]) n++;
        return n;
      }
      function eoRank(w){
        if (!w) return null;
        return function(x, cost){ return cost + w * badEdges(x); };
      }
      const F2L_MACRO = [], LIFT_MACRO = [];
      for (let k=0;k<4;k++){
        F2L_MACRO[k] = U_MACROS.concat(macros(F2L_TRIG.map(a=>subAlg(parseAlg(a),k))));
        LIFT_MACRO[k] = macros(F2L_TRIG.map(a=>subAlg(parseAlg(a),k)));
      }

      /* ---------- 3. 最後の1段 ---------- */
      // 上面の十字(辺の向き)。
      const OLL_EDGE_ALGS = macros(["F R U R' U' F'", "F U R U' R' F'"]);
      // 上面の角の向き。7通りすべてを1手順で片づけられるように並べてある。
      const OLL_CORNER_ALGS = macros([
        "R U R' U R U2 R'",              // スーン
        "R U2 R' U' R U' R'",            // 逆スーン
        "R U2 R2 U' R2 U' R2 U2 R",      // パイ
        "R U R' U R U' R' U R U2 R'",    // H
        "R U2 R' U' R U R' U' R U' R'",  // H(別)
        "R U R' U' R' F R2 U R' U' F'",  // 角2つ
        "R2 D R' U2 R D' R' U2 R'",      // 2つが同じ向きにねじれ
        "L' U' L U' L' U2 L",            // 左まわりの版
        "L U L' U L U2 L'",
        "R' U2 R U R' U R"
      ]);
      // 上面ぞろえ(PLL)。ふつうは1手順＋回し合わせで終わる。
      const PLL_RAW = macros([
        "R U' R U R U R U' R' U' R2",                                  // Ua
        "R2 U R U R' U' R' U' R' U R'",                                // Ub
        "R' F R' B2 R F' R' B2 R2",                                    // Aa
        "R2 B2 R F R' B2 R F' R",                                      // Ab
        "R U R' U' R' F R2 U' R' U' R U R' F'",                        // T
        "R' U L' U2 R U' R' U2 R L",                                   // Ja
        "R U R' F' R U R' U' R' F R2 U' R' U'",                        // Jb
        "F R U' R' U' R U R' F' R U R' U' R' F R F'",                  // Y
        "R U' R' U' R U R D R' U' R D' R' U2 R'",                      // Ra
        "R2 F R U R U' R' F' R U2 R' U2 R",                            // Rb
        "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",              // F
        "R2 U R' U R' U' R U' R2 U' D R' U R D'",                      // Ga
        "R' U' R U D' R2 U R' U R U' R U' R2 D",                       // Gb
        "R2 U' R U' R U R' U R2 U D' R U' R' D",                       // Gc
        "R U R' U' D R2 U' R U' R' U R' U R2 D'",                      // Gd
        "R' U R U' R' F' U' F R U R' F R' F' R U' R",                  // Nb
        "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"        // Na
      ]);

      function runStep(state, out, list, goal, ph, label){
        const r = bestAlg(state, list, goal, true);
        if (!r) throw new Error('search failed: ' + label);
        let s = state;
        for (const m of r){ s = applyMove(s, m); out.push({ m: m, ph: ph }); }
        return s;
      }

      /* ---------- 1・2段目のスロットを1つそろえる ---------- */
      const CORNER_SLOT_OF = {4:0, 7:1, 6:2, 5:3};
      const EDGE_SLOT_OF   = {8:0, 11:1, 10:2, 9:3};

      // eoW / extra は上の EO_WEIGHT / EO_EXTRA。0 を渡せば今までどおり手数最短。
      function solveSlot(state, k, done, eoW, extra){
        const corner = SLOT_CORNER[k], edge = SLOT_EDGE[k];
        if (cornerSolved(state,corner) && edgeSolved(state,edge)) return [];
        const keep = makeKeep(done.map(i=>SLOT_CORNER[i]), CROSS_EDGE.concat(done.map(i=>SLOT_EDGE[i])));
        const rank = eoRank(eoW);
        const out = [];
        let s = state;
        // 角がどこかのスロットに埋まっていたら、まず上の段へ出す
        if (!cornerSolved(s,corner) && !inU_c(s,corner)){
          const j = CORNER_SLOT_OF[cornerPosOf(s,corner)];
          const goal = (x)=> inU_c(x,corner) && keep(x);
          const r = search(s, LIFT_MACRO[j], goal, 2, rank) || search(s, SINGLES, goal, 4, rank);
          if (!r) return null;
          for (const m of r){ s = applyMove(s,m); out.push(m); }
        }
        // 辺も上の段へ(角は上に置いたまま)
        if (!edgeSolved(s,edge) && !inU_e(s,edge)){
          const j = EDGE_SLOT_OF[edgePosOf(s,edge)];
          const goal = (x)=> inU_e(x,edge) && (inU_c(x,corner)||cornerSolved(x,corner)) && keep(x);
          const r = search(s, LIFT_MACRO[j], goal, 2, rank) || search(s, SINGLES, goal, 4, rank);
          if (!r) return null;
          for (const m of r){ s = applyMove(s,m); out.push(m); }
        }
        // 角と辺をペアにして一度に入れる
        const goal = (x)=> cornerSolved(x,corner) && edgeSolved(x,edge) && keep(x);
        const r = search(s, F2L_MACRO[k], goal, 5, rank, extra) || search(s, F2L_MACRO[k], goal, 6, rank, extra);
        if (!r) return null;
        for (const m of r) out.push(m);
        return out;
      }

      /* ---------- 全体の組み立て ---------- */
      function solve(start){
        let s = C.clone(start);
        const out = [];

        // 1. 白クロス(最短手)
        const cr = solveCross(s);
        if (!cr) throw new Error('cross failed');
        for (const m of cr){ s = applyMove(s,m); out.push({ m: m, ph: 'cross' }); }

        // 2. 1・2段目 ― そのとき一番短くすむ場所から順に。
        //    ただし「手数 + EO_WEIGHT × 向きちがいの辺の枚数」で比べるので、
        //    同じくらいの手数なら上の段の辺の向きがそろう入れ方を選ぶ。
        const done = [];
        for (let round=0; round<4; round++){
          const eoW = EO_WEIGHT[round], extra = EO_EXTRA[round];
          let best = null;
          for (let k=0;k<4;k++){
            if (done.indexOf(k) >= 0) continue;
            const r = solveSlot(s, k, done, eoW, extra);
            if (!r) continue;
            let ns = s; for (const m of r) ns = applyMove(ns, m);
            const score = qtm(r) + eoW * badEdges(ns);
            if (!best || score < best.score) best = { k: k, moves: r, score: score };
          }
          if (!best) throw new Error('f2l failed');
          for (const m of best.moves){ s = applyMove(s,m); out.push({ m: m, ph: 'f2l'+(round+1) }); }
          done.push(best.k);
        }

        const keepF2L = makeKeep(SLOT_CORNER, CROSS_EDGE.concat(SLOT_EDGE));
        const eoDone = (x)=> x.eo[0]===0 && x.eo[1]===0 && x.eo[2]===0 && x.eo[3]===0;
        const coDone = (x)=> x.co[0]===0 && x.co[1]===0 && x.co[2]===0 && x.co[3]===0;
        const cpDone = (x)=> x.cp[0]===0 && x.cp[1]===1 && x.cp[2]===2 && x.cp[3]===3;

        // 3. 上の面をそろえる(OLL)
        if (!eoDone(s)){
          s = runStep(s, out, OLL_EDGE_ALGS, (x)=> eoDone(x) && keepF2L(x), 'ollEdge', 'oll-edge');
        }
        if (!coDone(s)){
          s = runStep(s, out, OLL_CORNER_ALGS, (x)=> coDone(x) && eoDone(x) && keepF2L(x), 'ollCorner', 'oll-corner');
        }
        // 4. 上の段を入れかえる(PLL)
        if (!isSolved(s)){
          const ph = cpDone(s) ? 'pllEdge' : 'pllCorner';
          s = runStep(s, out, PLL_RAW, isSolved, ph, 'pll');
        }

        if (!isSolved(s)) throw new Error('not solved at end');
        const opt = optimize(out);
        let chk = C.clone(start);
        for (const it of opt) chk = applyMove(chk, it.m);
        const final = isSolved(chk) ? opt : out;
        return { moves: final.map(it=>it.m), labels: final.map(it=>it.ph) };
      }

      /* ---------- 3Dキュービーから論理状態を読み取る (this is what will ship in index.html) ---------- */
      const FACEVEC = {R:[1,0,0], L:[-1,0,0], U:[0,1,0], D:[0,-1,0], F:[0,0,1], B:[0,0,-1]};
      const SW = {U:'D', D:'U', R:'L', L:'R', F:'F', B:'B'};
      const CORNER_ORDER = [['U','R','F'],['U','F','L'],['U','L','B'],['U','B','R'],
                            ['D','F','R'],['D','L','F'],['D','B','L'],['D','R','B']];
      const EDGE_ORDER = [['U','R'],['U','F'],['U','L'],['U','B'],['D','R'],['D','F'],
                          ['D','L'],['D','B'],['F','R'],['F','L'],['B','L'],['B','R']];
      const key = a => a.slice().sort().join('');
      const CORNER_IDX = {}; CORNER_ORDER.forEach((t,i)=> CORNER_IDX[key(t)] = i);
      const EDGE_IDX = {};   EDGE_ORDER.forEach((t,i)=> EDGE_IDX[key(t)] = i);
      const vkey = v => Math.round(v[0])+','+Math.round(v[1])+','+Math.round(v[2]);
      const LETTER_OF_VEC = {}; for(const [L,v] of Object.entries(FACEVEC)) LETTER_OF_VEC[vkey(v)] = L;

      function readState(cubies, getPos, getInit, mapVec){
        // colour currently sitting on each local direction (centres never lie)
        const colourOfDir = {};
        for(const c of cubies){
          const ip = getInit(c);
          if(ip.filter(v=>v!==0).length !== 1) continue;
          colourOfDir[vkey(getPos(c))] = LETTER_OF_VEC[vkey(ip)];
        }
        const st = {cp:new Array(8), co:new Array(8), ep:new Array(12), eo:new Array(12)};
        for(const c of cubies){
          const ip = getInit(c), pos = getPos(c);
          const n = ip.filter(v=>v!==0).length;
          if(n===0 || n===1) continue;

          // letters of the piece's own stickers (app colour letters)
          const homeApp = [];
          for(let i=0;i<3;i++) if(ip[i]!==0){ const v=[0,0,0]; v[i]=ip[i]; homeApp.push(LETTER_OF_VEC[vkey(v)]); }
          // colours of the faces of the slot it currently occupies
          const slotApp = [];
          for(let i=0;i<3;i++) if(pos[i]!==0){ const v=[0,0,0]; v[i]=pos[i]; slotApp.push(colourOfDir[vkey(v)]); }

          const piece = homeApp.map(l=>SW[l]);
          const slot  = slotApp.map(l=>SW[l]);

          if(n===3){
            const pi = CORNER_IDX[key(piece)], si = CORNER_IDX[key(slot)];
            st.cp[si] = pi;
            const ud = homeApp.find(l=> l==='U' || l==='D');           // white / yellow sticker
            const dir = mapVec(c, FACEVEC[ud]);
            const onFace = SW[ colourOfDir[vkey(dir)] ];
            st.co[si] = CORNER_ORDER[si].indexOf(onFace);
          } else {
            const pi = EDGE_IDX[key(piece)], si = EDGE_IDX[key(slot)];
            st.ep[si] = pi;
            const primarySolver = EDGE_ORDER[pi][0];
            const dir = mapVec(c, FACEVEC[ SW[primarySolver] ]);
            const onFace = SW[ colourOfDir[vkey(dir)] ];
            st.eo[si] = (onFace === EDGE_ORDER[si][0]) ? 0 : 1;
          }
        }
        return st;
      }

      /* ---------- app move -> geometric cfg, and -> solver move ---------- */
      // clockwise turn of the local face whose outward dir is `sign` on `axis`:
      //   dir = -sign   (matches the app's resolveMove)
      function cfgForColour(colourLetterApp, prime, colourOfDir){
        for(const [k,L] of Object.entries(colourOfDir)){
          if(L !== colourLetterApp) continue;
          const v = k.split(',').map(Number);
          const i = v.findIndex(x=>x!==0);
          const sign = v[i];
          return {axisIdx:i, layers:[sign], dir: prime ? sign : -sign};
        }
        return null;
      }
      function colourMap(cubies){
        const m = {};
        for(const c of cubies){
          if(c.init.filter(v=>v!==0).length!==1) continue;
          m[vkey(c.pos)] = LETTER_OF_VEC[vkey(c.init)];
        }
        return m;
      }
      return {
        solve: solve,
        readState: readState,
        isSolved: isSolved,
        FACEVEC: FACEVEC,
        SW: SW,
        LETTER_OF_VEC: LETTER_OF_VEC,
        vkey: vkey
      };
    })();
