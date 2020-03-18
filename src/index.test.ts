import * as Safe from './index';

describe('Type-safe composable serializers', () => {
  test('object', () => {
    const s = Safe.obj({
      x: Safe.str,
      y: Safe.array(Safe.int)
    });
    const o = { x: 'hi', y: [1,2,3] };

    expect(s.read(s.write(o))).toEqual(o);
    expect(() => s.read([])).toThrowError(Safe.ParseError);
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
    expect(() => s.read({})).toThrowError(Safe.ParseError);
  });

  test('boolean', () => {
    expect(Safe.bool.read(Safe.bool.write(true))).toBeTruthy();
    expect(Safe.bool.read(Safe.bool.write(false))).toBeFalsy();
    expect(() => Safe.bool.read('true')).toThrowError(Safe.ParseError);
  });

  test('tuple', () => {
    const s = Safe.tuple(Safe.str, Safe.optional(Safe.array(Safe.int)));
    expect(s.read(s.write(["hi", undefined]))).toEqual(["hi", undefined]);
    expect(s.read(s.write(["hi", [2,3]]))).toEqual(["hi", [2,3]]);
    expect(() => s.read({})).toThrowError(Safe.ParseError);
  });

  test('dateIso', () => {
    const d = new Date();
    expect(Safe.dateIso.read(Safe.dateIso.write(d))).toEqual(d);
    expect(() => Safe.dateIso.read('blah')).toThrowError(Safe.ParseError);
    expect(() => Safe.dateIso.read(null)).toThrowError(Safe.ParseError);
  });

  test('dateUnixSecs', () => {
    const d = new Date();
    expect(Safe.dateUnixSecs.read(123456789.0)).toEqual(new Date(123456789000));
    expect(Safe.dateUnixSecs.read(Safe.dateUnixSecs.write(d))).toEqual(d);
    expect(() => Safe.dateUnixSecs.read('blah')).toThrowError(Safe.ParseError);
    expect(() => Safe.dateUnixSecs.read(null)).toThrowError(Safe.ParseError);
  });

  test('dateUnixMillis', () => {
    const d = new Date();
    expect(Safe.dateUnixMillis.read(123456789.0)).toEqual(new Date(123456789));
    expect(Safe.dateUnixMillis.read(Safe.dateUnixMillis.write(d))).toEqual(d);
    expect(() => Safe.dateUnixMillis.read('blah')).toThrowError(Safe.ParseError);
    expect(() => Safe.dateUnixMillis.read(null)).toThrowError(Safe.ParseError);
  });

  test('raw', () => {
    const d = {'some': ['random', {stuff: 123}]};
    expect(Safe.raw.read(Safe.raw.write(d))).toEqual(d);
  });

  test('str', () => {
    expect(Safe.str.read(Safe.str.write("hi"))).toEqual("hi");
    expect(() => Safe.str.read(null)).toThrowError(Safe.ParseError);
  });

  test('int', () => {
    expect(Safe.int.read(Safe.int.write(123))).toEqual(123);
    expect(() => Safe.int.read("erm")).toThrowError(Safe.ParseError);
  });

  test('float', () => {
    expect(Safe.float.read(Safe.float.write(123.45))).toEqual(123.45);
    expect(() => Safe.float.read("erm")).toThrowError(Safe.ParseError);
  });

  test('sumtype (oneOf)', () => {
    const s = Safe.oneOf({a:'', b:''});
    expect(s.read('a')).toEqual('a');
    expect(() => s.read('c')).toThrowError(Safe.ParseError);
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
      () => s.read({type: 'blah'})
    ).toThrowError(Safe.ParseError);
  });
});
