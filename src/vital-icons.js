// Original nine-pixel HUD art. 1 = outline, 2 = colored interior, 4 = bone.
const pixels = {
  health: ['011000110','122101221','122212221','122222221','012222210','001222100','000121000','000010000','000000000'],
  hunger: ['000011000','000122100','001222210','012222210','012222100','001221000','000141000','000144100','000011000'],
};
const cache = new Map();
export function vitalIcon(kind, fill) {
  const key = `${kind}:${fill}`; if (cache.has(key)) return cache.get(key);
  const rects = pixels[kind].flatMap((row,y)=>[...row].flatMap((pixel,x)=> {
    if(pixel==='0')return [];
    const active = fill === 2 || fill === 1 && x < 4;
    const color = pixel==='1' ? '#18251f' : !active ? '#647165' : pixel==='4' ? '#f4dfaf' : kind==='health' ? '#ee5c62' : '#c88a50';
    return `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
  })).join('');
  const url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9" shape-rendering="crispEdges">${rects}</svg>`)}`;
  cache.set(key,url); return url;
}
