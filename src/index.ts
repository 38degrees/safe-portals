/**
 * Type-safe, composable serialization/unserialization.
 *
 * Safe-portals can be used wherever data traverses an un-typed boundary
 * (eg from DB, tasks sent to resque, HTTP calls, routing information in
 * URLs), in order to maintain static analysis across the un-typed boundary.
 */
export class ValidationError extends Error {
  constructor(wanted: string, got: any) {
    super(`ValidationError: expected ${wanted} but found ${JSON.stringify(got)}`);
    // needed because JS is silly
    // @ts-ignore
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
// why this wrapper with 'never' type? so we can put error handling into expressions
export const validationError = (wanted: string, got: any): never => {
  throw new ValidationError(wanted, got)
}

type Jsonifyable = any;
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
    description: () => "[version, "+args.schema.description() + (args.migrations.length > 0 ? " or previous version]" : ']'),
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
  description: () => 'Date (seconds since epoch)',
  read: (o: Jsonifyable): Date => {
    const d = new Date(typeof o == 'number' ? o * 1000.0 : validationError("DateUnixSecs", o));
    return isNaN(d.getTime()) ? validationError('dateUnixSecs', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.getTime() / 1000.0
    : validationError('Date', t)
};

export const dateUnixMillis: Type<Date> = {
  container: 'none',
  description: () => 'Date (milliseconds since epoch)',
  read: (o: Jsonifyable): Date => {
    const d = new Date(typeof o == 'number' ? o : validationError("DateUnixMillis", o));
    return isNaN(d.getTime()) ? validationError('dateUnixMillis', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.getTime()
    : validationError('Date', t)
};

export const dateIso: Type<Date> = {
  container: 'none',
  description: () => 'Date (ISO)',
  read: (o: Jsonifyable): Date => {
    const d = new Date(typeof o == 'string' ? o : validationError('IsoDateString', o));
    return isNaN(d.getTime()) ? validationError('dateIso', o) : d;
  },
  write: t =>
    t instanceof Date
    ? t.toISOString()
    : validationError('Date', t)
};

export const str: Type<string> = {
  container: 'none',
  description: () => 'string',
  read: (o: Jsonifyable): string => {
    return typeof o == 'string' ? o : validationError('string', o);
  },
  write: t =>
    typeof(t) == 'string'
    ? t
    : validationError('string', t)
}

export const nothing: Type<void> = {
  container: 'none',
  description: () => 'nothing',
  read: (o: any): void => {},
  write: o => ''
}

export const bool: Type<boolean> = {
  container: 'none',
  description: () => 'boolean',
  read: (o: any): boolean => typeof o == 'boolean' ? o : validationError('boolean', o),
  write: o => 
    typeof(o) == 'boolean'
    ? o
    : validationError('boolean', o)
}

export const int: Type<number> = {
  container: 'none',
  description: () => 'integer',
  read: (o: any): number => {
    const i = parseInt(o);
    return isNaN(i) ? validationError('integer', o) : i;
  },
  write: o => 
    typeof(o) == 'number'
    ? o
    : validationError('number', o)
}

export const float: Type<number> = {
  container: 'none',
  description: () => 'float',
  read: (o: any): number => {
    const i = parseFloat(o);
    return isNaN(i) ? validationError('float', o) : i;
  },
  write: o => 
    typeof(o) == 'number'
    ? o
    : validationError('number', o)
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
      : validationError('uuid', o);
  },
  write: t => {
    return typeof t == 'string' && t.match(UUID_REGEX)
      ? t
      : validationError('uuid', t);
  }
}

export function optional<T>(s: Type<T>): Type<T | undefined> {
  return {
    container: 'none',
    description: () => 'null | ' + s.description(),
    read: (o: Jsonifyable): T | undefined => o == null ? undefined : s.read(o),
    write: (t: T | undefined): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function nullable<T>(s: Type<T>): Type<T | null> {
  return {
    container: 'none',
    description: () => 'null | ' + s.description(),
    read: (o: Jsonifyable): T | null => o == null ? null : s.read(o),
    write: (t: T | null): Jsonifyable => t == null ? null : s.write(t)
  }
}

export function array<T>(s: Type<T>): List<T[]> {
  return {
    container: 'list',
    description: () => `[${s.description()},...]`,
    read: (o: any): T[] => {
      return o instanceof Array ? o.map(s.read) : validationError('array', o);
    },
    write: (o: T[]): Jsonifyable =>
      o instanceof Array
      ? o.map(s.write)
      : validationError('array', o)
  }
}

export function obj<T extends Record<string, Type<any>>>(def: T)
: Obj<{ [key in keyof T]: TypeEncapsulatedBy<T[key]> }>
{
  type R = { [key in keyof T]: TypeEncapsulatedBy<T[key]> };

  const read = (o: Jsonifyable): R => {
    if (!(o instanceof Object) || (o instanceof Array)) {
      return validationError('an object', o);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      out[key] = def[key].read(o[key]);
    }
    return out;
  };

  const write = (r: R): Jsonifyable => {
    if (!(r instanceof Object)) return validationError('object', r);

    const out: any = {};
    for (let key of Object.keys(def)) {
      out[key] = def[key].write(r[key]);
    }
    return out;
  };

  return {
    container: 'obj',
    description: () => "{" + Object.keys(def).map(k => `"${k}": ${def[k].description()}`).join(', ') + "}",
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
      return validationError('an object', o);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      out[key] = optional(def[key]).read(o[key]);
    }
    return out;
  };

  const write = (r: R): Jsonifyable => {
    if (!(r instanceof Object) || (r instanceof Array)) {
      return validationError('object', r);
    }

    const out: any = {};
    for (let key of Object.keys(def)) {
      out[key] = optional(def[key]).write(r[key]);
    }
    return out;
  };

  return {
    container: 'obj',
    description: () => "{" + Object.keys(def).map(k => `"${k}"?: ${def[k].description()}`).join(', ') + "}",
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
    description: () => "[" + def.map((d, i) => d.description()).join(', ') + "]",
    read: (o: Jsonifyable): R => {
      if (o instanceof Array) {
        return def.map((d, i) => d.read(o[i])) as any;
      } else {
        return validationError('an array', o);
      }
    },
    write: (r: R): Jsonifyable =>
      r instanceof Array
      ? def.map((d, i) => d.write(r[i]))
      : validationError('array', r)
  }
}

export function oneOf<T>(def: T)
  : SumType<keyof T>
{
  type R = keyof T;
  return {
    container: 'sumtype',
    description: () => Object.keys(def).map(k => `"${k}"`).join(' | '),
    read: (o: Jsonifyable): R => {
      if (Object.keys(def).indexOf(o) != -1) {
        return o;
      } else {
        return validationError(`one of ${Object.keys(def)}`, o);
      }
    },
    write: (t: R) => 
      Object.keys(def).indexOf(t as string) != -1
      ? t
      : validationError(`one of ${Object.keys(def)}`, t)
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
      variantTypes.map((t, i) => 
        `({"type": "${t}"} & ${variantSerializers[i].description()})`
      ).join(' | '),
    read: (o: Jsonifyable): R => {
      const i = variantTypes.indexOf(o.type);
      if (i == -1) {
        return validationError(`type in ${JSON.stringify(variantTypes)}`, o);
      } else {
        return {
          ...variantSerializers[i].read(o),
          type: o.type
        };
      }
    },
    write: (t: R) => {
      const i = variantTypes.indexOf(t.type);
      if (i == -1) {
        return validationError(`type in ${JSON.stringify(variantTypes)}`, t);
      } else {
        return {
          ...variantSerializers[i].write(t),
          type: t.type
        };
      }
    }
  }
}
