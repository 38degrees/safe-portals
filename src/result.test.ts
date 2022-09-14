import * as Safe from './index';
import { Result } from './index';

describe('Result type and serializer', () => {
  test('result with complex type', () => {
    const s = Result.serializer({ ok: Safe.dateIso, error: Safe.array(Safe.int) });

    expect(s.write({ ok: new Date(2020, 1, 1) })).toEqual({ ok: "2020-02-01T00:00:00.000Z" });
    expect(s.write({ error: [1,2,3] })).toEqual({ error: [1,2,3] });

    expect(s.read({ ok: "2020-02-01T00:00:00.000Z" })).toEqual({ ok: new Date(2020, 1, 1) });
  });

  test('result', () => {
    const s = Result.serializer({ ok: Safe.str, error: Safe.int });
    expect(s.description()).toEqual("result(str,int)");

    expect(s.write({ ok: "hi" })).toEqual({ ok: "hi" });
    expect(s.write({ error: 123 })).toEqual({ error: 123 });

    const r1 = s.read(s.write({ ok: "oi" }));

    expect(Result.isOk(r1)).toBeTruthy();
    expect(Result.isErr(r1)).toBeFalsy();

    if (Result.isOk(r1)) {
      expect(r1.ok).toEqual("oi");
    } else {
      throw Error("Expected isOk");
    }

    const r2 = s.read(s.write({ error: 123 }));
    expect(Result.isOk(r2)).toBeFalsy();
    expect(Result.isErr(r2)).toBeTruthy();
  });
});
