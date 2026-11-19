export const stackKey = stack => stack ? `${stack.id}:${stack.damage??0}` : '';
export const sameStack = (a,b) => Boolean(a&&b&&stackKey(a)===stackKey(b));
