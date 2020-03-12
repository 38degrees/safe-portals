/**
 * Type-safe, composable serialization/unserialization.
 *
 * Safe-portals can be used wherever data traverses an un-typed boundary
 * (eg from DB, tasks sent to resque, HTTP calls, routing information in
 * URLs), in order to maintain static analysis across the un-typed boundary.
 */
export class ParseError extends Error {
  constructor(wanted: string, got: any) {
    super(`Parse error: expected ${wanted} but found '${got}'`);
    // needed because JS is silly
    // @ts-ignore
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}
// why this wrapper with 'never' type? so we can put error handling into expressions
const parseError = (wanted: string, got: any): never => {
  throw new ParseError(wanted, got)
}

type Jsonifyable = any;
// ^^ purely documentary type. Not really useful to do right, but the following would be 'correct' (and requires TS 3.7+)
// type Jsonifyable = string | number | boolean | null | Jsonifyable[] | { [key: string]: Jsonifyable };
type Reader<T> = (o: Jsonifyable) => T;
type Writer<T> = (t: T) => Jsonifyable;
interface SafeSerializer<T> { read: Reader<T>; write: Writer<T>; }

export interface Tuple<T> extends SafeSerializer<T> { container: 'tuple' }
export interface Value<T> extends SafeSerializer<T> { container: 'none' }
export interface List<T> extends SafeSerializer<T> { container: 'list' }
export interface Obj<T> extends SafeSerializer<T> { container: 'obj' }
export interface DateIso<T> extends SafeSerializer<T> { container: 'dateIso' }
export interface DateUnixSecs<T> extends SafeSerializer<T> { container: 'dateUnixSecs' }
export interface DateUnixMillis<T> extends SafeSerializer<T> { container: 'dateUnixMillis' }
export type Type<T> = Tuple<T> | List<T> | Value<T> | Obj<T> | DateIso<T> | DateUnixSecs<T> | DateUnixMillis<T>;

/**
 * useful for getting the TS type that a safe serializer operates on.
 * ie. TypeEncapsulatedBy<Type<T>> = T
 */
export type TypeEncapsulatedBy<T extends SafeSerializer<any>> = ReturnType<T['read']>;

export const dateUnixSecs: Type<Date> = {
  container: 'none',
  read: (o: Jsonifyable): Date => {
    const d = new Date(parseFloat(o) * 1000.0);
    return isNaN(d.getTime()) ? parseError('dateUnixSecs', o) : d;
  },
  write: t => t.getTime() / 1000.0
};

export const dateUnixMillis: Type<Date> = {
  container: 'none',
  read: (o: Jsonifyable): Date => {
    const d = new Date(parseFloat(o));
    return isNaN(d.getTime()) ? parseError('dateUnixMillis', o) : d;
  },
  write: t => t.getTime()
};

export const dateIso: Type<Date> = {
  container: 'none',
  read: (o: Jsonifyable): Date => {
    const d = new Date(o ? o.toString() : '');
    return isNaN(d.getTime()) ? parseError('dateIso', o) : d;
  },
  write: t => t.toISOString()
};

export const str: Type<string> = {
  container: 'none',
  read: (o: Jsonifyable): string => {
    return typeof o == 'string' ? o : parseError('string', o);
  },
  write: t => t
}

export const nothing: Type<void> = {
  container: 'none',
  read: (o: any): void => {},
  write: o => ''
}

export const bool: Type<boolean> = {
  container: 'none',
  read: (o: any): boolean => typeof o == 'boolean' ? o : parseError('boolean', o),
  write: o => o
}

export const int: Type<number> = {
  container: 'none',
  read: (o: any): number => {
    const i = parseInt(o);
    return isNaN(i) ? parseError('integer', o) : i;
  },
  write: o => o
}

export const float: Type<number> = {
  container: 'none',
  read: (o: any): number => {
    const i = parseFloat(o);
    return isNaN(i) ? parseError('float', o) : i;
  },
  write: o => o
}

export const raw: Type<any> = {
  container: 'none',
  read: o => o,
  write: o => o
}

export function optional<T>(s: Type<T>): Type<T | undefined> {
  return {
    container: 'none',
    read: (o: Jsonifyable): T | undefined => o == null ? undefined : s.read(o),
    write: (t: T | undefined): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function nullable<T>(s: Type<T>): Type<T | null> {
  return {
    container: 'none',
    read: (o: Jsonifyable): T | null => o == null ? null : s.read(o),
    write: (t: T | null): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function array<T>(s: Type<T>): List<T[]> {
  return {
    container: 'list',
    read: (o: any): T[] => {
      return o instanceof Array ? o.map(s.read) : parseError('array', o);
    },
    write: (o: T[]): Jsonifyable => o.map(s.write)
  }
}

export function obj<T extends Record<string, Type<any>>>(def: T)
: Obj<{ [key in keyof T]: TypeEncapsulatedBy<T[key]> }>
{
  type R = { [key in keyof T]: TypeEncapsulatedBy<T[key]> };
  return {
    container: 'obj',
    read: (o: Jsonifyable): R => {
      const out: any = {};
      for (let key of Object.keys(def)) {
        if (o instanceof Object && !(o instanceof Array)) {
          out[key] = def[key].read(o[key]);
        } else {
          parseError('an object', o);
        }
      }
      return out;
    },
    write: (r: R): Jsonifyable => {
      const out: any = {};
      for (let key of Object.keys(def)) {
        out[key] = def[key].write(r[key]);
      }
      return out;
    }
  }
}

export function tuple<T extends Array<SafeSerializer<any>>>(...def: T)
  : Tuple<{ [key in keyof T]: T[key] extends SafeSerializer<any> ? TypeEncapsulatedBy<T[key]> : never }>
{
  type R = { [key in keyof T]: T[key] extends SafeSerializer<any> ? TypeEncapsulatedBy<T[key]> : never };
  return {
    container: 'tuple',
    read: (o: Jsonifyable): R => {
      if (o instanceof Array) {
        return def.map((d, i) => d.read(o[i])) as any;
      } else {
        return parseError('an array', o);
      }
    },
    write: (r: R): Jsonifyable => def.map((d, i) => d.write(r[i]))
  }
}
