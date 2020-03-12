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

  test('isodate', () => {
    const d = new Date();
    expect(Safe.isodate.read(Safe.isodate.write(d))).toEqual(d);
    expect(() => Safe.isodate.read('blah')).toThrowError(Safe.ParseError);
    expect(() => Safe.isodate.read(null)).toThrowError(Safe.ParseError);
  });

  test('unixdate', () => {
    const d = new Date();
    expect(Safe.unixdate.read(123456789.0)).toEqual(new Date(123456789000));
    expect(Safe.unixdate.read(Safe.unixdate.write(d))).toEqual(d);
    expect(() => Safe.unixdate.read('blah')).toThrowError(Safe.ParseError);
    expect(() => Safe.unixdate.read(null)).toThrowError(Safe.ParseError);
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
});
