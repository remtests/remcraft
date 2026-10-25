'use strict';

// ════════════════════════════════════════════════
// CRAFTING GRID STATE
// ════════════════════════════════════════════════
const CG=new Array(9).fill(null).map(()=>({id:null,n:0}));
const ICG=new Array(4).fill(null).map(()=>({id:null,n:0}));
let craftResult=null;
let invCraftResult=null;

function checkRecipe(gridType){
  // Compact recipe matching: shift recipe pattern to match wherever it's placed in the grid
  // This handles e.g. planks in any corner for sticks, etc.
  function matchGrid(recipeG, gridG, gw){
    // Build bounding box of non-zero items in recipe
    const rw=3, rh=3;
    let rMinC=3,rMaxC=-1,rMinR=3,rMaxR=-1;
    for(let r=0;r<rh;r++) for(let c=0;c<rw;c++){
      if(recipeG[r*rw+c]!==0){rMinR=Math.min(rMinR,r);rMaxR=Math.max(rMaxR,r);rMinC=Math.min(rMinC,c);rMaxC=Math.max(rMaxC,c);}
    }
    if(rMaxR===-1) return gridG.every(v=>v===null); // empty recipe = empty grid
    // Build bounding box of non-null items in grid
    let gMinC=gw,gMaxC=-1,gMinR=Math.ceil(gridG.length/gw),gMaxR=-1;
    for(let i=0;i<gridG.length;i++){
      if(gridG[i]!==null){const r=Math.floor(i/gw),c=i%gw;gMinR=Math.min(gMinR,r);gMaxR=Math.max(gMaxR,r);gMinC=Math.min(gMinC,c);gMaxC=Math.max(gMaxC,c);}
    }
    if(gMaxR===-1) return false; // grid empty, recipe not
    // Check size fits
    if((rMaxR-rMinR)!==(gMaxR-gMinR)||(rMaxC-rMinC)!==(gMaxC-gMinC)) return false;
    // Compare cell by cell with offset
    const dr=gMinR-rMinR, dc=gMinC-rMinC;
    for(let r=rMinR;r<=rMaxR;r++) for(let c=rMinC;c<=rMaxC;c++){
      const rv=recipeG[r*rw+c];
      const gi=(r+dr)*gw+(c+dc);
      const gv=gi<gridG.length?gridG[gi]:null;
      if(rv===0&&gv!==null) return false;
      if(rv!==0&&rv!==gv) return false;
    }
    return true;
  }

  if(gridType==='craft'||gridType===undefined){
    craftResult=null;
    const g=CG.map(s=>s.id);
    for(const r of RECIPES){
      if(r.n===0) continue;
      if(matchGrid(r.g, g, 3)){craftResult=r;break;}
    }
  }
  if(gridType==='invcraft'||gridType===undefined){
    invCraftResult=null;
    const g2=[ICG[0].id,ICG[1].id,ICG[2].id,ICG[3].id];
    // Map 2×2 grid slots to a flat array for matching (gw=2)
    for(const r of RECIPES){
      if(r.n===0) continue;
      // Flatten recipe to 2×2 bounding max — only try if recipe fits in 2×2
      // First build recipe bounding box
      let rMinC=3,rMaxC=-1,rMinR=3,rMaxR=-1;
      for(let row=0;row<3;row++) for(let col=0;col<3;col++){
        if(r.g[row*3+col]!==0){rMinR=Math.min(rMinR,row);rMaxR=Math.max(rMaxR,row);rMinC=Math.min(rMinC,col);rMaxC=Math.max(rMaxC,col);}
      }
      if(rMaxR-rMinR>1||rMaxC-rMinC>1) continue; // doesn't fit in 2×2
      if(matchGrid(r.g, g2, 2)){invCraftResult=r;break;}
    }
  }
}

function doCraft(){
  if(!craftResult) return;
  addInv(craftResult.r, craftResult.n);
  for(let i=0;i<9;i++) if(CG[i].id!==null){
    CG[i].n--; if(CG[i].n<=0){CG[i].id=null;CG[i].n=0;}
  }
  checkRecipe('craft'); drawCraftUI(); drawHotbar();
}

function doInvCraft(){
  if(!invCraftResult) return;
  addInv(invCraftResult.r, invCraftResult.n);
  for(let i=0;i<4;i++) if(ICG[i].id!==null){
    ICG[i].n--; if(ICG[i].n<=0){ICG[i].id=null;ICG[i].n=0;}
  }
  checkRecipe('invcraft'); drawInv(); drawHotbar();
}
