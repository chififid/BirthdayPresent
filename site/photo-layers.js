// Rendering order is also hit-test order: particles sit behind every subject.
export function photoLayer(tile){
 if(tile.kind==='grid'||tile.kind==='choice-grid')return 0;
 if(tile.kind==='confetti'||tile.kind==='choice-confetti')return 1;
 if(tile.kind==='gift-image')return 3;
 if(tile.kind==='choice-frame')return 4;
 if(tile.kind==='choice-clip')return 5;
 if(tile.kind==='choice-cursor')return 6;
 return 2;
}
export function orderPhotoLayers(tiles){return tiles.sort((a,b)=>photoLayer(a)-photoLayer(b));}
