import * as Safe from './index';

// note the ts-ignore on various tests that the type system would reject
// at build time, but could arise due to bad code managing the type boundary.

describe('Type-safe composable serializers', () => {
  test('partial_obj', () => {
    const s = Safe.partial_obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { y: [1,2,3] };

    expect(s.read(s.write(o))).toEqual(o);
    // @ts-ignore
    expect(() => s.write([])).toThrowError(Safe.ValidationError);
    expect(() => s.read([])).toThrowError(Safe.ValidationError);
  });

  test('obj', () => {
    const s = Safe.obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { x: 'hi', y: [1,2,3] };

    expect(s.read(s.write(o))).toEqual(o);
    // @ts-ignore
    expect(() => s.write([])).toThrowError(Safe.ValidationError);
    expect(() => s.read([])).toThrowError(Safe.ValidationError);
  });

  test('obj.read_with_defaults', () => {
    const s = Safe.obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { x: 'hi' };

    expect(() => s.read(o)).toThrowError(Safe.ValidationError);
    expect(s.read_with_defaults({x: 'oi', y:[1,2,3]}, o)).toEqual({ x: 'hi', y: [1,2,3] });
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
    // @ts-ignore
    expect(() => s.write({})).toThrowError(Safe.ValidationError);
  });

  test('boolean', () => {
    expect(Safe.bool.read(Safe.bool.write(true))).toBeTruthy();
    expect(Safe.bool.read(Safe.bool.write(false))).toBeFalsy();
    expect(() => Safe.bool.read('true')).toThrowError(Safe.ValidationError);
    // @ts-ignore
    expect(() => Safe.bool.write('true')).toThrowError(Safe.ValidationError);
  });

  test('tuple', () => {
    const s = Safe.tuple(Safe.str, Safe.optional(Safe.array(Safe.int)));
    expect(s.read(s.write(["hi", undefined]))).toEqual(["hi", undefined]);
    expect(s.read(s.write(["hi", [2,3]]))).toEqual(["hi", [2,3]]);
    expect(() => s.read({})).toThrowError(Safe.ValidationError);
    // @ts-ignore
    expect(() => s.write({})).toThrowError(Safe.ValidationError);
  });

  test('dateIso', () => {
    const d = new Date();
    expect(Safe.dateIso.read(Safe.dateIso.write(d))).toEqual(d);
    expect(() => Safe.dateIso.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateIso.read(null)).toThrowError(Safe.ValidationError);
    // @ts-ignore
    expect(() => Safe.dateIso.write('blah')).toThrowError(Safe.ValidationError);
  });

  test('dateUnixSecs', () => {
    const d = new Date();
    expect(Safe.dateUnixSecs.read(123456789.0)).toEqual(new Date(123456789000));
    expect(Safe.dateUnixSecs.read(Safe.dateUnixSecs.write(d))).toEqual(d);
    // @ts-ignore
    expect(() => Safe.dateUnixSecs.write('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read(null)).toThrowError(Safe.ValidationError);
  });

  test('dateUnixMillis', () => {
    const d = new Date();
    expect(Safe.dateUnixMillis.read(123456789.0)).toEqual(new Date(123456789));
    expect(Safe.dateUnixMillis.read(Safe.dateUnixMillis.write(d))).toEqual(d);
    // @ts-ignore
    expect(() => Safe.dateUnixMillis.write('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixMillis.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixMillis.read(null)).toThrowError(Safe.ValidationError);
  });

  test('raw', () => {
    const d = {'some': ['random', {stuff: 123}]};
    expect(Safe.raw.read(Safe.raw.write(d))).toEqual(d);
  });

  test('str', () => {
    expect(Safe.str.read(Safe.str.write("hi"))).toEqual("hi");
    // @ts-ignore
    expect(() => Safe.str.write(1)).toThrowError(Safe.ValidationError);
    expect(() => Safe.str.read(null)).toThrowError(Safe.ValidationError);
  });

  test('int', () => {
    expect(Safe.int.read(Safe.int.write(123))).toEqual(123);
    // @ts-ignore
    expect(() => Safe.int.write('hi')).toThrowError(Safe.ValidationError);
    expect(() => Safe.int.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('float', () => {
    expect(Safe.float.read(Safe.float.write(123.45))).toEqual(123.45);
    // @ts-ignore
    expect(() => Safe.float.write('hi')).toThrowError(Safe.ValidationError);
    expect(() => Safe.float.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('sumtype (oneOf)', () => {
    const s = Safe.oneOf({a:'', b:''});
    expect(s.read('a')).toEqual('a');
    expect(() => s.read('c')).toThrowError(Safe.ValidationError);
    expect(s.write('a')).toEqual('a');
    // @ts-ignore
    expect(() => s.write('c')).toThrowError(Safe.ValidationError);
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
      // @ts-ignore
      () => s.write({type: 'nonsense'})
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
