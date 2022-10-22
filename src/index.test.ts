import * as Safe from './index';

describe('Type-safe composable serializers', () => {
  test('versioned', () => {
    const v1 = Safe.versioned({
      schema: Safe.obj({ x: Safe.dateIso }),
      migrations: []
    });

    expect(v1.description()).toEqual('versioned({schema: obj({x: dateIso}), migrations: ...})');

    const v1_serialized = v1.write({ x: new Date(2020, 0, 1) });
    expect(v1_serialized).toEqual([ 0, { x: "2020-01-01T00:00:00.000Z" } ]);

    expect(v1.read(v1_serialized)).toEqual({ x: new Date(2020, 0, 1) });

    // now make new schema version with date stored as dateUnixSecs
    const v2_missing_migration = Safe.versioned({
      schema: Safe.obj({ x: Safe.dateUnixSecs }),
      migrations: []
    });

    // expected date to be a number now, but is ISO string
    expect(() => v2_missing_migration.read(v1_serialized)).toThrowError(Safe.ValidationError);

    // give migration
    const v2 = Safe.versioned({
      schema: Safe.obj({ x: Safe.dateUnixSecs }),
      migrations: [
        o => ({ x: Safe.dateUnixSecs.write(Safe.dateIso.read(o.x)) })
      ]
    });
    expect(v2.read(v1_serialized)).toEqual({ x: new Date(2020, 0, 1) });
    expect(v2.description()).toEqual('versioned({schema: obj({x: dateUnixSecs}), migrations: ...})');

    const v2_serialized = v2.write(v2.read(v1_serialized));
    expect(v2_serialized).toEqual([ 1, { x: new Date(2020,0,1).getTime() / 1000.0 } ]);

    // another version, with an extra migration. we've renamed an attribute
    const v3 = Safe.versioned({
      schema: Safe.obj({ myDate: Safe.dateUnixSecs }),
      migrations: [
        o => ({ x: Safe.dateUnixSecs.write(Safe.dateIso.read(o.x)) }),
        o => ({ myDate: o.x })
      ]
    });

    expect(v3.read(v1_serialized)).toEqual({ myDate: new Date(2020, 0, 1)});
    expect(v3.read(v2_serialized)).toEqual({ myDate: new Date(2020, 0, 1)});
    expect(v3.write({ myDate: new Date(2020, 0, 1) })).toEqual([2, { myDate: new Date(2020, 0, 1).getTime() / 1000.0 } ]);
  });

  test('description', () => {
    expect(Safe.str.description()).toEqual("str");
    expect(Safe.optional(Safe.str).description()).toEqual("optional(str)");
    expect(Safe.array(Safe.dateIso).description()).toEqual("array(dateIso)");
    expect(Safe.array(Safe.dateUnixSecs).description()).toEqual("array(dateUnixSecs)");
    expect(Safe.array(Safe.dateUnixMillis).description()).toEqual("array(dateUnixMillis)");
    expect(Safe.nothing.description()).toEqual("nothing");
    expect(Safe.bool.description()).toEqual("bool");
    expect(Safe.raw.description()).toEqual("raw");
    expect(Safe.uuid.description()).toEqual("uuid");
    expect(Safe.nullable(Safe.uuid).description()).toEqual("nullable(uuid)");
    expect(Safe.obj({ x: Safe.str, y: Safe.int }).description()).toEqual(`obj({x: str, y: int})`);
    expect(Safe.partial_obj({ x: Safe.str, y: Safe.int }).description()).toEqual(`partial_obj({x: str, y: int})`);
    expect(Safe.tuple(Safe.str, Safe.float).description()).toEqual("tuple(str, float)");
    expect(Safe.oneOf("apple", "orange").description()).toEqual('oneOf("apple", "orange")');
    expect(Safe.variant(
      'circle', Safe.obj({ radius: Safe.float }),
      'person', Safe.obj({ name: Safe.str }),
    ).description()).toEqual('variant(\"circle\", obj({radius: float}), \"person\", obj({name: str}))');
  });

  test('helpful error messages', () => {
    expect(() => Safe.array(Safe.int).write(false as any)).toThrow("data does not match serializer in data false");
    expect(() => Safe.array(Safe.int).read(false as any)).toThrow("data does not match serializer in data false");
    expect(() => Safe.array(Safe.int).write([1,2,false] as any)).toThrow("data[2] does not match serializer in data [1,2,false]");
    expect(() => Safe.obj({x: Safe.array( Safe.int )}).read({x:[ 1,true ]})).toThrow("data.x[1] does not match serializer in data {\"x\":[1,true]}");
    expect(() => Safe.obj({x: Safe.array( Safe.int )}).write({x:[ 1,true ]} as any)).toThrow("data.x[1] does not match serializer in data {\"x\":[1,true]}");
    expect(() => Safe.partial_obj({x: Safe.array( Safe.int )}).read({x:[ 1,true ]})).toThrow("data.x[1] does not match serializer in data {\"x\":[1,true]}");
    expect(() => Safe.partial_obj({x: Safe.array( Safe.int )}).write({x:[ 1,true ]} as any)).toThrow("data.x[1] does not match serializer in data {\"x\":[1,true]}");
    expect(() => Safe.tuple(Safe.int, Safe.str).read([12,13])).toThrow("data[1] does not match serializer in data [12,13]");
    expect(() => Safe.tuple(Safe.int, Safe.str).write([12,13] as any)).toThrow("data[1] does not match serializer in data [12,13]");
    {
      const v = Safe.variant(
        'circle', Safe.obj({ radius: Safe.float }),
        'person', Safe.obj({ name: Safe.str }),
      );
      expect(() => v.read({})).toThrow("data does not match serializer in data {}");
      expect(() => v.write({} as any)).toThrow("data does not match serializer in data {}");
      expect(() => v.read({type: 'circle', radius: false})).toThrow("data<circle>.radius does not match serializer in data {\"type\":\"circle\",\"radius\":false}");
      expect(() => v.write({type: 'circle', radius: false} as any)).toThrow("data<circle>.radius does not match serializer in data {\"type\":\"circle\",\"radius\":false}");
      expect(() => v.read({type: 'blah'})).toThrow("data does not match serializer in data {\"type\":\"blah\"}");
    }
    /*
    {
      const v = Safe.versioned({ schema: Safe.obj({x: Safe.int}), migrations: [] });
      expect(() => v.read([3, {x: 123}])).toThrow("");
    }
    */
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
    expect(Safe.dateIso.read(d)).toEqual(d);
    expect(Safe.dateIso.read(Safe.dateIso.write(d))).toEqual(d);
    expect(() => Safe.dateIso.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateIso.read(null)).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateIso.write('blah' as any)).toThrowError(Safe.ValidationError);
  });

  test('dateUnixSecs', () => {
    const d = new Date();
    expect(Safe.dateUnixSecs.read(d)).toEqual(d);
    expect(Safe.dateUnixSecs.read(123456789.0)).toEqual(new Date(123456789000));
    expect(Safe.dateUnixSecs.read(Safe.dateUnixSecs.write(d))).toEqual(d);
    expect(() => Safe.dateUnixSecs.write('blah' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read('blah')).toThrowError(Safe.ValidationError);
    expect(() => Safe.dateUnixSecs.read(null)).toThrowError(Safe.ValidationError);
  });

  test('dateUnixMillis', () => {
    const d = new Date();
    expect(Safe.dateUnixMillis.read(d)).toEqual(d);
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
    expect(Safe.int.read(Safe.int.write(123.4))).toEqual(123);
    expect(Safe.int.read(Safe.int.write(-123.4))).toEqual(-123);
    expect(() => Safe.int.write('hi' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.int.write(NaN)).toThrowError(Safe.ValidationError);
    expect(() => Safe.int.write(Infinity)).toThrowError(Safe.ValidationError);
    expect(() => Safe.int.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('float', () => {
    expect(Safe.float.read(Safe.float.write(123.45))).toEqual(123.45);
    expect(() => Safe.float.write('hi' as any)).toThrowError(Safe.ValidationError);
    expect(() => Safe.float.write(NaN)).toThrowError(Safe.ValidationError);
    expect(() => Safe.float.write(Infinity)).toThrowError(Safe.ValidationError);
    expect(() => Safe.float.read("erm")).toThrowError(Safe.ValidationError);
  });

  test('sumtype (oneOf)', () => {
    const s = Safe.oneOf("a", "b");
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

  test('combine', () => {
    const s = Safe.combine(
      Safe.obj({ x: Safe.int }),
      Safe.obj({ y: Safe.str, z: Safe.bool })
    );

    expect(s.read(s.write({ x: 123, y: "hi", z: false }))).toEqual({ x: 123, y: "hi", z: false });
    expect(() => s.read({ x: 123, y: 234, z: false })).toThrowError(Safe.ValidationError);
    expect(s.description()).toEqual('combine(obj({x: int}),obj({y: str, z: bool}))');
  });
});
