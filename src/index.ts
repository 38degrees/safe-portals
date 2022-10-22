/**
 * Type-safe, composable serialization/unserialization.
 *
 * Safe-portals can be used wherever data traverses an un-typed boundary
 * (eg from DB, tasks sent to resque, HTTP calls, routing information in
 * URLs), in order to maintain static analysis across the un-typed boundary.
 */
export class ValidationError extends Error {
  constructor(public path: string, public got: any) {
    super();
    this.message = `data${this.path} does not match serializer in data ${JSON.stringify(this.got)}`;
    // needed because JS is silly
    // @ts-ignore
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
// why this wrapper with 'never' type? so we can put error handling into expressions
export const validationError = (path: string, got: any): never => {
  throw new ValidationError(path, got)
}

export type Jsonifyable = any;
// ^^ purely documentary type. Not really useful to do right, but the following would be 'correct' (and requires TS 3.7+)
// type Jsonifyable = string | number | boolean | null | Jsonifyable[] | { [key: string]: Jsonifyable };
type Reader<T> = (o: Jsonifyable) => T;
type Writer<T> = (t: T) => Jsonifyable;
export interface Serializer<T> { read: Reader<T>; write: Writer<T>; description: () => string }

export interface Versioned<T> extends Serializer<T> { container: 'versioned' }
export interface Tuple<T> extends Serializer<T> { container: 'tuple' }
export interface Value<T> extends Serializer<T> { container: 'none' }
export interface List<T> extends Serializer<T> { container: 'list' }
export interface Obj<T> extends Serializer<T> { container: 'obj' }
export interface SumType<T> extends Serializer<T> { container: 'sumtype' }
export interface DateIso<T> extends Serializer<T> { container: 'dateIso' }
export interface DateUnixSecs<T> extends Serializer<T> { container: 'dateUnixSecs' }
export interface DateUnixMillis<T> extends Serializer<T> { container: 'dateUnixMillis' }
export type Type<T> = Tuple<T> | List<T> | Value<T> | Obj<T> | DateIso<T> | DateUnixSecs<T> | DateUnixMillis<T> | SumType<T> | Versioned<T>;

/**
 * useful for getting the TS type that a safe serializer operates on.
 * ie. TypeIn<Type<T>> = T
 */
export type TypeEncapsulatedBy<T extends Serializer<any>> = ReturnType<T['read']>;
export type TypeIn<T extends Serializer<any>> = TypeEncapsulatedBy<T>;

type VersionMigrator = (o: Jsonifyable) => Jsonifyable;

/**
 * Versioned serializable type, with data migrations.
 *
 * Serialized format is: [version: int, data: T]
 *
 * Version migrations operate on raw, unserialized data (see type of VersionMigrator)
 */
export function versioned<T>(args: { schema: Type<T>; migrations: VersionMigrator[] }): Versioned<T> {
  const inner = tuple(int, raw);
  return {
    container: 'versioned',
    description: () => "versioned({schema: "+args.schema.description()+", migrations: ...})",
    read: (_o: Jsonifyable): T => {
      const o = inner.read(_o);
      let ver = o[0];
      let data = o[1];
      // apply data migrations
      while (ver < args.migrations.length) {
        data = args.migrations[ver](data);
        ver++;
      }
      return args.schema.read(data);
    },
    write: (t: T): Jsonifyable => inner.write([args.migrations.length /* version */, args.schema.write(t)])
  }
}

export const dateUnixSecs: Type<Date> = {
  container: 'none',
  description: () => 'dateUnixSecs',
  read: (o: Jsonifyable): Date => {
    // @ts-ignore hmm look into this XXX
    const d = new Date(typeof o == 'number' ? o * 1000.0 : (o instanceof Date ? o : validationError('', o)));
    return isNaN(d.getTime()) ? validationError('', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.getTime() / 1000.0
    : validationError('', t)
};

export const dateUnixMillis: Type<Date> = {
  container: 'none',
  description: () => 'dateUnixMillis',
  read: (o: Jsonifyable): Date => {
    // @ts-ignore
    const d = new Date(typeof o == 'number' ? o : (o instanceof Date ? o : validationError("", o)));
    return isNaN(d.getTime()) ? validationError('', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.getTime()
    : validationError('', t)
};

export const dateIso: Type<Date> = {
  container: 'none',
  description: () => 'dateIso',
  read: (o: Jsonifyable): Date => {
    // @ts-ignore
    const d = new Date(typeof o == 'string' ? o : (o instanceof Date ? o : validationError('', o)));
    return isNaN(d.getTime()) ? validationError('', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.toISOString()
    : validationError('', t)
};

export const str: Type<string> = {
  container: 'none',
  description: () => 'str',
  read: (o: Jsonifyable): string => {
    return typeof o == 'string' ? o : validationError('', o);
  },
  write: t =>
    typeof(t) == 'string'
    ? t
    : validationError('', t)
}

export const nothing: Type<void> = {
  container: 'none',
  description: () => 'nothing',
  read: (o: any): void => {},
  write: o => ''
}

export const bool: Type<boolean> = {
  container: 'none',
  description: () => 'bool',
  read: (o: any): boolean => typeof o == 'boolean' ? o : validationError('', o),
  write: o => 
    typeof(o) == 'boolean'
    ? o
    : validationError('', o)
}

export const int: Type<number> = {
  container: 'none',
  description: () => 'int',
  read: (o: any): number => {
    const i = parseInt(o);
    return isNaN(i) ? validationError('', o) : i;
  },
  write: o => 
    typeof(o) == 'number' && isFinite(o)
    ? Math.trunc(o)
    : validationError('', o)
}

export const float: Type<number> = {
  container: 'none',
  description: () => 'float',
  read: (o: any): number => {
    const i = parseFloat(o);
    return isNaN(i) ? validationError('', o) : i;
  },
  write: o => 
    // NaN, Infinity can't be represented in JSON, so we reject those
    typeof(o) == 'number' && isFinite(o)
    ? o
    : validationError('', o)
}

export const raw: Type<any> = {
  container: 'none',
  description: () => 'raw',
  read: o => o,
  write: o => o
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuid: Type<string> = {
  container: 'none',
  description: () => 'uuid',
  read: (o: Jsonifyable): string => {
    return typeof o == 'string' && o.match(UUID_REGEX)
      ? o
      : validationError('', o);
  },
  write: t => {
    return typeof t == 'string' && t.match(UUID_REGEX)
      ? t
      : validationError('', t);
  }
}

export function optional<T>(s: Type<T>): Type<T | undefined> {
  return {
    container: 'none',
    description: () => 'optional(' + s.description() + ')',
    read: (o: Jsonifyable): T | undefined => o == null ? undefined : s.read(o),
    write: (t: T | undefined): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function nullable<T>(s: Type<T>): Type<T | null> {
  return {
    container: 'none',
    description: () => 'nullable(' + s.description() + ')',
    read: (o: Jsonifyable): T | null => o == null ? null : s.read(o),
    write: (t: T | null): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function array<T>(s: Type<T>): List<T[]> {
  return {
    container: 'list',
    description: () => `array(${s.description()})`,
    read: (o: any): T[] => {
      if (!(o instanceof Array)) validationError('', o);
      let out = [];
      for (let i=0; i<o.length; i++) {
        try {
          out.push(s.read(o[i]));
        } catch (e) {
          if (e instanceof ValidationError) {
            return validationError('[' + i + ']' + e.path, o);
          }
          throw e;
        }
      }
      return out;
    },
    write: (o: T[]): Jsonifyable => {
      if (o instanceof Array) {
        const out = [];
        for (let i=0; i<o.length; i++) {
          try {
            out.push(s.write(o[i]));
          } catch (e) {
            if (e instanceof ValidationError) {
              return validationError('[' + i + ']' + e.path, o);
            }
            throw e;
          }
        }
        return out;
      } else {
        validationError('', o);
      }
    }
  }
}

export function obj<T extends Record<string, Type<any>>>(def: T)
: Obj<{ [key in keyof T]: TypeEncapsulatedBy<T[key]> }>
{
  type R = { [key in keyof T]: TypeEncapsulatedBy<T[key]> };

  const read = (o: Jsonifyable): R => {
    if (!(o instanceof Object) || (o instanceof Array)) {
      return validationError('', o);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      try {
        out[key] = def[key].read(o[key]);
      } catch (e) {
        if (e instanceof ValidationError) {
          return validationError('.' + key + e.path, o);
        }
        throw e;
      }
    }
    return out;
  };

  const write = (r: R): Jsonifyable => {
    if (!(r instanceof Object)) return validationError('', r);

    const out: any = {};
    for (let key of Object.keys(def)) {
      try {
        out[key] = def[key].write(r[key]);
      } catch (e) {
        if (e instanceof ValidationError) {
          return validationError('.' + key + e.path, r);
        }
        throw e;
      }
    }
    return out;
  };

  return {
    container: 'obj',
    description: () => `obj({${Object.keys(def).map(k => `${k}: ${def[k].description()}`).join(', ')}})`,
    read,
    write,
  }
}

/**
 * Like obj, but all properties are optional
 */
export function partial_obj<T extends Record<string, Type<any>>>(def: T)
: Obj<{ [key in keyof T]?: TypeEncapsulatedBy<T[key]> }>
{
  type R = { [key in keyof T]?: TypeEncapsulatedBy<T[key]> };

  const read = (o: Jsonifyable): R => {
    if (!(o instanceof Object) || (o instanceof Array)) {
      return validationError('', o);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      try {
        out[key] = optional(def[key]).read(o[key]);
      } catch (e) {
        if (e instanceof ValidationError) {
          return validationError('.' + key + e.path, o);
        }
        throw e;
      }
    }
    return out;
  };

  const write = (r: R): Jsonifyable => {
    if (!(r instanceof Object) || (r instanceof Array)) {
      return validationError('', r);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      try {
        out[key] = optional(def[key]).write(r[key]);
      } catch (e) {
        if (e instanceof ValidationError) {
          return validationError('.' + key + e.path, r);
        }
        throw e;
      }
    }
    return out;
  };

  return {
    container: 'obj',
    description: () => `partial_obj({${Object.keys(def).map(k => `${k}: ${def[k].description()}`).join(', ')}})`,
    read,
    write,
  }
}

export function tuple<T extends Array<Serializer<any>>>(...def: T)
  : Tuple<{ [key in keyof T]: T[key] extends Serializer<any> ? TypeEncapsulatedBy<T[key]> : never }>
{
  type R = { [key in keyof T]: T[key] extends Serializer<any> ? TypeEncapsulatedBy<T[key]> : never };
  return {
    container: 'tuple',
    description: () => "tuple(" + def.map((d) => d.description()).join(', ') + ")",
    read: (o: Jsonifyable): R => {
      if (o instanceof Array) {
        const out = [];
        let i=0;
        try {
          for (; i<o.length; i++) {
            out.push(def[i].read(o[i]));
          }
        } catch (e) {
          if (e instanceof ValidationError) {
            return validationError('[' + i + ']' + e.path, o);
          }
          throw e;
        }
        return out as any;
      } else {
        return validationError('', o);
      }
    },
    write: (r: R): Jsonifyable => {
      if (r instanceof Array) {
        const out = [];
        let i=0;
        try {
          for (; i<r.length; i++) {
            out.push(def[i].write(r[i]));
          }
        } catch (e) {
          if (e instanceof ValidationError) {
            return validationError('[' + i + ']' + e.path, r);
          }
          throw e;
        }
        return out;
      } else {
        return validationError('', r);
      }
    }
  }
}

export function oneOf<T0 extends string>(t0: T0): SumType<T0>;
export function oneOf<T0 extends string, T1 extends string>(t0: T0, t1: T1): SumType<T0 | T1>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string>(t0: T0, t1: T1, t2: T2): SumType<T0 | T1 | T2>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string>(t0: T0, t1: T1, t2: T2, t3: T3): SumType<T0 | T1 | T2 | T3>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4): SumType<T0 | T1 | T2 | T3 | T4>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5): SumType<T0 | T1 | T2 | T3 | T4 | T5>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string, T15 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14, t15: T15): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string, T15 extends string, T16 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14, t15: T15, t16: T16): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15 | T16>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string, T15 extends string, T16 extends string, T17 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14, t15: T15, t16: T16, t17: T17): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15 | T16 | T17>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string, T15 extends string, T16 extends string, T17 extends string, T18 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14, t15: T15, t16: T16, t17: T17, t18: T18): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15 | T16 | T17 | T18>;
export function oneOf<T0 extends string, T1 extends string, T2 extends string, T3 extends string, T4 extends string, T5 extends string, T6 extends string, T7 extends string, T8 extends string, T9 extends string, T10 extends string, T11 extends string, T12 extends string, T13 extends string, T14 extends string, T15 extends string, T16 extends string, T17 extends string, T18 extends string, T19 extends string>(t0: T0, t1: T1, t2: T2, t3: T3, t4: T4, t5: T5, t6: T6, t7: T7, t8: T8, t9: T9, t10: T10, t11: T11, t12: T12, t13: T13, t14: T14, t15: T15, t16: T16, t17: T17, t18: T18, t19: T19): SumType<T0 | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | T9 | T10 | T11 | T12 | T13 | T14 | T15 | T16 | T17 | T18 | T19>;

// @ts-ignore
export function oneOf(...args)
{
  type R = any; // can't infer here
  return {
    container: 'sumtype',
    description: () => 'oneOf('+args.map(k => `"${k}"`).join(', ')+')',
    read: (o: Jsonifyable): R => {
      if (args.indexOf(o) != -1) {
        return o;
      } else {
        return validationError('', o);
      }
    },
    write: (t: R) => 
      args.indexOf(t as string) != -1
      ? t
      : validationError('', t)
  }
}

/* Variant. Pity that typescript doesn't have variadic generics... */
// @ts-ignore
export function variant<
  Tag0 extends string, Variant0 extends Obj<any>
>(
  a: Tag0, b: Variant0
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
>(
  a: Tag0, b: Variant0,
  c: Tag1, d: Variant1,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
  Tag5 extends string, Variant5 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
  t5: Tag5, v5: Variant5,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>) |
  ({ type: Tag5 } & TypeEncapsulatedBy<Variant5>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
  Tag5 extends string, Variant5 extends Obj<any>,
  Tag6 extends string, Variant6 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
  t5: Tag5, v5: Variant5,
  t6: Tag6, v6: Variant6,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>) |
  ({ type: Tag5 } & TypeEncapsulatedBy<Variant5>) |
  ({ type: Tag6 } & TypeEncapsulatedBy<Variant6>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
  Tag5 extends string, Variant5 extends Obj<any>,
  Tag6 extends string, Variant6 extends Obj<any>,
  Tag7 extends string, Variant7 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
  t5: Tag5, v5: Variant5,
  t6: Tag6, v6: Variant6,
  t7: Tag7, v7: Variant7,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>) |
  ({ type: Tag5 } & TypeEncapsulatedBy<Variant5>) |
  ({ type: Tag6 } & TypeEncapsulatedBy<Variant6>) |
  ({ type: Tag7 } & TypeEncapsulatedBy<Variant7>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
  Tag5 extends string, Variant5 extends Obj<any>,
  Tag6 extends string, Variant6 extends Obj<any>,
  Tag7 extends string, Variant7 extends Obj<any>,
  Tag8 extends string, Variant8 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
  t5: Tag5, v5: Variant5,
  t6: Tag6, v6: Variant6,
  t7: Tag7, v7: Variant7,
  t8: Tag8, v8: Variant8,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>) |
  ({ type: Tag5 } & TypeEncapsulatedBy<Variant5>) |
  ({ type: Tag6 } & TypeEncapsulatedBy<Variant6>) |
  ({ type: Tag7 } & TypeEncapsulatedBy<Variant7>) |
  ({ type: Tag8 } & TypeEncapsulatedBy<Variant8>)
>;

export function variant<
  Tag0 extends string, Variant0 extends Obj<any>,
  Tag1 extends string, Variant1 extends Obj<any>,
  Tag2 extends string, Variant2 extends Obj<any>,
  Tag3 extends string, Variant3 extends Obj<any>,
  Tag4 extends string, Variant4 extends Obj<any>,
  Tag5 extends string, Variant5 extends Obj<any>,
  Tag6 extends string, Variant6 extends Obj<any>,
  Tag7 extends string, Variant7 extends Obj<any>,
  Tag8 extends string, Variant8 extends Obj<any>,
  Tag9 extends string, Variant9 extends Obj<any>,
>(
  t0: Tag0, v0: Variant0,
  t1: Tag1, v1: Variant1,
  t2: Tag2, v2: Variant2,
  t3: Tag3, v3: Variant3,
  t4: Tag4, v4: Variant4,
  t5: Tag5, v5: Variant5,
  t6: Tag6, v6: Variant6,
  t7: Tag7, v7: Variant7,
  t8: Tag8, v8: Variant8,
  t9: Tag9, v9: Variant9,
): SumType<
  ({ type: Tag0 } & TypeEncapsulatedBy<Variant0>) |
  ({ type: Tag1 } & TypeEncapsulatedBy<Variant1>) |
  ({ type: Tag2 } & TypeEncapsulatedBy<Variant2>) |
  ({ type: Tag3 } & TypeEncapsulatedBy<Variant3>) |
  ({ type: Tag4 } & TypeEncapsulatedBy<Variant4>) |
  ({ type: Tag5 } & TypeEncapsulatedBy<Variant5>) |
  ({ type: Tag6 } & TypeEncapsulatedBy<Variant6>) |
  ({ type: Tag7 } & TypeEncapsulatedBy<Variant7>) |
  ({ type: Tag8 } & TypeEncapsulatedBy<Variant8>) |
  ({ type: Tag9 } & TypeEncapsulatedBy<Variant9>)
>;

// @ts-ignore
export function variant(...args) {
  type R = any; // can't infer return type here. too complex
  const variantTypes = args.filter((v, i) => i%2==0);
  const variantSerializers = args.filter((v, i) => i%2!=0);

  // @ts-ignore
  return {
    description: () =>
      `variant(${
        variantTypes.map((t, i) => 
          `"${t}", ${variantSerializers[i].description()}`
        ).join(', ')
      })`,
    read: (o: Jsonifyable): R => {
      const i = variantTypes.indexOf(o.type);
      if (i == -1) {
        return validationError('', o);
      } else {
        try {
          return {
            ...variantSerializers[i].read(o),
            type: o.type
          };
        } catch (e) {
          if (e instanceof ValidationError) {
            return validationError('<' + o.type + '>' + e.path, o);
          }
          else throw e;
        }
      }
    },
    write: (t: R) => {
      const i = variantTypes.indexOf(t.type);
      if (i == -1) {
        return validationError('', t);
      } else {
        try {
          return {
            ...variantSerializers[i].write(t),
            type: t.type
          };
        } catch (e) {
          if (e instanceof ValidationError) {
            return validationError('<' + t.type + '>' + e.path, t);
          }
          else throw e;
        }
      }
    }
  }
}

export function combine<T0, T1, T2, T3, T4, T5, T6, T7, T8>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>, t4: Obj<T4>, t5: Obj<T5>, t6: Obj<T6>, t7: Obj<T7>, t8: Obj<T8>): Obj<T0 & T1 & T2 & T3 & T4 & T5 & T6 & T7 & T8>;
export function combine<T0, T1, T2, T3, T4, T5, T6, T7>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>, t4: Obj<T4>, t5: Obj<T5>, t6: Obj<T6>, t7: Obj<T7>): Obj<T0 & T1 & T2 & T3 & T4 & T5 & T6 & T7>;
export function combine<T0, T1, T2, T3, T4, T5, T6>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>, t4: Obj<T4>, t5: Obj<T5>, t6: Obj<T6>): Obj<T0 & T1 & T2 & T3 & T4 & T5 & T6>;
export function combine<T0, T1, T2, T3, T4, T5>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>, t4: Obj<T4>, t5: Obj<T5>): Obj<T0 & T1 & T2 & T3 & T4 & T5>;
export function combine<T0, T1, T2, T3, T4>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>, t4: Obj<T4>): Obj<T0 & T1 & T2 & T3 & T4>;
export function combine<T0, T1, T2, T3>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>, t3: Obj<T3>): Obj<T0 & T1 & T2 & T3>;
export function combine<T0, T1, T2>(t0: Obj<T0>, t1: Obj<T1>, t2: Obj<T2>): Obj<T0 & T1 & T2>;
export function combine<T0, T1>(t0: Obj<T0>, t1: Obj<T1>): Obj<T0 & T1>;
// @ts-ignore
export function combine(...args) {
    return {
        container: 'obj',
        description: () => `combine(${args.map(a => a.description()).join(',')})`,
        read: (o: any): any => Object.assign({}, ...args.map(_t => _t.read(o))),
        write: (o: any): any => Object.assign({}, ...args.map(_t => _t.write(o))),
    }
}

export * as Result from "./result";
