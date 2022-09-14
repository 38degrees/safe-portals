import { Obj, Type, validationError, Jsonifyable } from "./index";

/**
 * Result type, for passing exceptional conditions across serialization boundaries
 */
export type Ok<R> = { ok: R };
export type Err<E> = { error: E };
export type Result<R,E> = Ok<R> | Err<E>;
export function isOk<R, E>(r: Result<R, E>): r is Ok<R> {
  // @ts-ignore
  return r.ok !== undefined ? true : false;
}
export function isErr<R, E>(r: Result<R, E>): r is Err<E> {
  // @ts-ignore
  return r.error !== undefined ? true : false;
}

export function serializer<R, E>(serializers: { ok: Type<R>, error: Type<E> }): Obj<Result<R, E>> {
  return {
    container: 'obj',
    description: () => `result(${serializers.ok.description()},${serializers.error.description()})`,
    read: (o: any): Result<R, E> => {
      if (!(o instanceof Object)) return validationError('object', o);
      if (o.error === undefined) {
        return { ok: serializers.ok.read(o.ok) }
      } else {
        return { error: serializers.error.read(o.error) }
      }
    },
    write: (o: Result<R, E>): Jsonifyable => {
      if (isOk(o)) {
        return { ok: serializers.ok.write(o.ok) };
      } else {
        return { error: serializers.error.write(o.error) };
      }
    }
  }
}
