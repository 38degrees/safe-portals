import * as Safe from './index';

describe('Type-safe composable serializers', () => {
  test('description', () => {
    expect(Safe.str.description()).toEqual("string");
    expect(Safe.optional(Safe.str).description()).toEqual("null | string");
    expect(Safe.array(Safe.dateIso).description()).toEqual("[Date (ISO),...]");
    expect(Safe.array(Safe.dateUnixSecs).description()).toEqual("[Date (seconds since epoch),...]");
    expect(Safe.array(Safe.dateUnixMillis).description()).toEqual("[Date (milliseconds since epoch),...]");
    expect(Safe.nothing.description()).toEqual("nothing");
    expect(Safe.bool.description()).toEqual("boolean");
    expect(Safe.raw.description()).toEqual("raw");
    expect(Safe.uuid.description()).toEqual("uuid");
    expect(Safe.nullable(Safe.uuid).description()).toEqual("null | uuid");
    expect(Safe.obj({ x: Safe.str, y: Safe.int }).description()).toEqual(`{"x": string, "y": integer}`);
    expect(Safe.partial_obj({ x: Safe.str, y: Safe.int }).description()).toEqual(`{"x"?: string, "y"?: integer}`);
    expect(Safe.tuple(Safe.str, Safe.float).description()).toEqual("[string, float]");
    expect(Safe.oneOf({ apple: '', orange: '' }).description()).toEqual('"apple" | "orange"');
    expect(Safe.variant(
      'circle', Safe.obj({ radius: Safe.float }),
      'person', Safe.obj({ name: Safe.str }),
    ).description()).toEqual('({"type": "circle"} & {"radius": float}) | ({"type": "person"} & {"name": string})');
  });

  test('partial_obj', () => {
    const s = Safe.partial_obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { y: [1,2,3] };

    expect(s.read(s.write(o))).toEqual(o);
    expect(() => s.write([] as any)).toThrowError(Safe.ValidationError);
    expect(() => s.read([])).toThrowError(Safe.ValidationError);
  });

  test('obj', () => {
    const s = Safe.obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { x: 'hi', y: [1,2,3] };

    expect(s.read(s.write(o))).toEqual(o);
    expect(() => s.write(1 as any)).toThrowError(Safe.ValidationError);
    expect(() => s.write([] as any)).toThrowError(Safe.ValidationError);
    expect(() => s.read([])).toThrowError(Safe.ValidationError);
  });

  test('nothing', () => {
    expect(Safe.nothing.read(Safe.nothing.write(undefined))).toEqual(undefined);
  });

  test('nullable', () => {
    const s = Safe.nullable(Safe.str);
    expect(s.read(s.write(null))).toEqual(null);
    expect(s.read(s.write('hi'))).toEqual('hi');
  });

  test('array', () => {
    const s = Safe.array(Safe.int);
    expect(s.read(s.write([1,2,3,4]))).toEqual([1,2,3,4]);
    expect(() => s.read({})).toThrowError(Safe.ValidationError);
    expect(() => s.write({} as any)).toThrowError(Safe.ValidationError);
  });

  test('boolean', () => {
    expect(Safe.bool.read(Safe.bool.write(true))).toBeTruthy();
    expect(Safe.bool.read(Safe.bool.write(false))).toBeFalsy();
    expect(() => Safe.bool.read('true')).toThrowError(Safe.ValidationError);
    expect(() => Safe.bool.write('true' as any)).toThrowError(Safe.ValidationError);
  });

  test('tuple', () => {
    const s = Safe.tuple(Safe.str, Safe.optional(Safe.array(Safe.int)));
    expect(s.read(s.write(["hi", undefined]))).toEqual(["hi", undefined]);
    expect(s.read(s.write(["hi", [2,3]]))).toEqual(["hi", [2,3]]);
    expect(() => s.read({})).toThrowError(Safe.ValidationError);
    expect(() => s.write({} as any)).toThrowError(Safe.ValidationError);
  });

  test('dateIso', () => {
    const d = new Date();
    expect(Safe.dateIso.read(Safe.dateIso.write(d))).toEqual(d);
    expect(() => Safe.dateIso.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateIso.read(null)).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateIso.write('blah' as any)).toThrowError(Safe.ValidationError);
  });

  test('dateUnixSecs', () => {
    const d = new Date();
    expect(Safe.dateUnixSecs.read(123456789.0)).toEqual(new Date(123456789000));
    expect(Safe.dateUnixSecs.read(Safe.dateUnixSecs.write(d))).toEqual(d);
    expect(() => Safe.dateUnixSecs.write('blah' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read(null)).toThrowError(Safe.ValidationError);
  });

  test('dateUnixMillis', () => {
    const d = new Date();
    expect(Safe.dateUnixMillis.read(123456789.0)).toEqual(new Date(123456789));
    expect(Safe.dateUnixMillis.read(Safe.dateUnixMillis.write(d))).toEqual(d);
    expect(() => Safe.dateUnixMillis.write('blah' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixMillis.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixMillis.read(null)).toThrowError(Safe.ValidationError);
  });

  test('raw', () => {
    const d = {'some': ['random', {stuff: 123}]};
    expect(Safe.raw.read(Safe.raw.write(d))).toEqual(d);
  });

  test('str', () => {
    expect(Safe.str.read(Safe.str.write("hi"))).toEqual("hi");
    expect(() => Safe.str.write(1 as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.str.read(null)).toThrowError(Safe.ValidationError);
  });

  test('int', () => {
    expect(Safe.int.read(Safe.int.write(123))).toEqual(123);
    expect(() => Safe.int.write('hi' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.int.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('float', () => {
    expect(Safe.float.read(Safe.float.write(123.45))).toEqual(123.45);
    expect(() => Safe.float.write('hi' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.float.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('sumtype (oneOf)', () => {
    const s = Safe.oneOf({a:'', b:''});
    expect(s.read('a')).toEqual('a');
    expect(() => s.read('c')).toThrowError(Safe.ValidationError);
    expect(s.write('a')).toEqual('a');
    expect(() => s.write('c' as any)).toThrowError(Safe.ValidationError);
  });

  test('variant', () => {
    const s = Safe.variant(
      'circle', Safe.obj({ radius: Safe.float }),
      'person', Safe.obj({ name: Safe.str }),
    );
    type T = Safe.TypeEncapsulatedBy<typeof s>;
    const testPerson: T = {type: 'person', name: 'Bob'};
    const testCircle: T = {type: 'circle', radius: 2};

    expect(
      s.read(s.write(testPerson))
    ).toEqual(
      testPerson
    );

    expect(
      s.read(s.write(testCircle))
    ).toEqual(
      testCircle
    );

    expect(
      () => s.read({type: 'nonsense'})
    ).toThrowError(Safe.ValidationError);

    expect(
      () => s.write({type: 'nonsense'} as any)
    ).toThrowError(Safe.ValidationError);
  });

  test('uuid', () => {
    expect(
      () => Safe.uuid.read('nonsense')
    ).toThrowError(Safe.ValidationError);

    expect(
      Safe.uuid.read('a333f018-c361-4b60-b306-578adf19f397')
    ).toEqual('a333f018-c361-4b60-b306-578adf19f397');

    expect(
      () => Safe.uuid.write('blah')
    ).toThrowError(Safe.ValidationError);

    expect(
      () => Safe.uuid.read({type: 'blah'})
    ).toThrowError(Safe.ValidationError);

    expect(
      Safe.uuid.write('a333f018-c361-4b60-b306-578adf19f397')
    ).toEqual('a333f018-c361-4b60-b306-578adf19f397');
  });
});
