# Safe Portals

### Type-safe, validated, composable serialization/unserialization

#### Why?

Safe-portals solves 3 problems with (JSON) serialization in JS/Typescript:

 * Many types are not handled. For example, `Date` objects are deserialized
   from JSON as strings. We want the original data to be unchanged by going
   through serialization and deserialization.
 * The schema of our data is not validated.
 * In TypeScript, data emerges from JSON.parse as `any` type. We would prefer
   to recover type annotations once the data has been validated as matching
   our expected schema.

#### Basics

Safe-portals can be used wherever data traverses an un-typed boundary
(eg from DB, tasks sent to resque, HTTP calls, routing information in
URLs), in order to maintain static analysis across the un-typed boundary.

You usually want to import the whole library:

```TSX
import * as S from 'safe-portals';
```

A safe-portal describes both the serialization and unserialization operation
for a particular type, bridging the gap between arbitrary typed values (like
JS Dates, or custom interfaces) and JSONable JS objects (ie only string, number,
boolean, null, arrays of these types, and objects indexed by strings and
containing only these types). For example:

```TSX
S.dateIso
```

Is a safe-portal for a date object. The unserialization operation is called
'read':

```TSX
S.dateIso.read("2020-03-04T12:27:41.360Z")
> Date Wed Mar 04 2020 12:27:41 GMT+0000 (Greenwich Mean Time)
```

The serialization operation is the other side of the
serialization/unserialization symmetry:

```TSX
S.dateIso.write(new Date())
> "2020-03-04T12:27:41.360Z"
```

Note that the safe-portal 'write' operation doesn't generate JSON -- it
generates JSONifiable JS objects -- and the 'read' operation doesn't expect to
be passed JSON, but objects parsed from JSON (or otherwise JSONifiable
objects). This means that a typical usage across an un-typed interface (like
HTTP) will look like:

```TSX
send(JSON.stringify(portal.write(value)));
```

and

```TSX
portal.read(JSON.parse(receive()))
```

#### Basic portal (serializer/deserializer) types

##### S.str

Portal for `string` type.

##### S.bool
Portal for `boolean` type.

##### S.int
Portal for `number` type, truncated to an integer.

##### S.float
Portal for `number` type, allowing decimals.

##### S.dateUnixSecs
Portal for `Date` type, with seconds since the Unix epoch as the
serialized representation.

##### S.dateUnixMillis
Portal for `Date` type, with milliseconds since the Unix epoch as the
serialized representation.

##### S.dateIso
Portal for `Date` type, with ISO 8601 as the serialized representation.

##### S.uuid
Portal for `string` type, validating that the string is a uuid.

##### S.raw
Portal for `any` type. Allows passthrough to plain JSON
stringify/parse behavior.

##### S.versioned({ schema: t, migrations: [...] })
Portal for the type given by the `schema` portal, with an ordered list
of data migration that will be run (first to last) before schema.read(),
to lazily migrate the data. For example:

```TS
const v1 = S.versioned({
	schema: S.obj({ x: S.dateIso }),
	migrations: []
});
```
This serializer handles data of the form `{x: new Date() }`. Supposing
we wished to change the serialized representation from dateIso to
dateUnixSecs, we could revise our serializer in this way:
```TS
const v2 = S.versioned({
	schema: S.obj({ x: S.dateUnixSecs }),
	migrations: [
		o => ({ x: S.dateUnixSecs.write(S.dateIso.read(o.x)) })
	]
});
```

##### S.optional(t)
Adds optionality to the portal argument `t`. Eg:

```TS
S.optional(S.str)
```
is a portal for the type `string | undefined`

##### S.nullable(t)
Adds nullability to the portal argument `t`. Eg:

```TS
S.nullable(S.str)
```
is a portal for the type `string | null`

##### S.array(t)
Portal for an array of the type that portal `t` handles. Eg:

```TS
S.array(S.float)
```
is a portal for the type `number[]`

##### S.obj({ ... })
Portal for arbitrary object types. Eg:

```TS
S.obj({
    name: S.str,
    date_of_birth: S.dateIso,
    date_of_death: S.optional(S.dateIso),
})
```
Is a portal for the type:

```TS
{
    name: string;
    date_of_birth: Date;
    date_of_death: Date | undefined;
}
```

##### S.partial_obj({ ... })
A fully optional version of `obj`. Eg:

```TS
S.partial_obj({
    name: S.str,
    date_of_birth: S.dateIso,
    date_of_death: S.optional(S.dateIso),
})
```
Is a portal for the type:

```TS
{
    name?: string;
    date_of_birth?: Date;
    date_of_death?: Date | undefined;
}
```

##### S.combine(o1, o2, ...)
A portal for a combination of obj and/or partial_obj serializers. Eg:
```TS
S.combine(
	S.obj({
	    name: S.str,
	    date_of_birth: S.dateIso,
	}),
	S.partial_obj({
	    date_of_death: S.dateIso,
	})
)
```

Is a portal for the type:
```TS
{
	name: string;
	date_of_birth: Date,
	date_of_death?: Date
}
```

##### S.tuple(t1, t2, ...)
A portal for an array-as-tuple type. Eg:

```TS
S.tuple(S.str, S.float, S.dateIso)
```

Is a portal for the type:

```TS
[string, number, Date]
```

##### S.oneOf(a, b, c, ...)
A portal for a string enum type. Eg:

```TS
S.oneOf('apple', 'orange', 'pear')
```

Is a portal for the type:

```TS
'apple' | 'orange' | 'pear'
```

##### S.variant(tag1, variant1, tag2, variant2, ...)
A portal for a tagged-union type. Eg:

```TS
S.variant(
	'circle', S.obj({ radius: S.float }),
	'rectangle', S.obj({ width: S.float, height: S.float }),
)
```

Is a portal for the type:

```TS
{ type: 'circle', radius: float } |
{ type: 'rectangle', width: float, height: float }
```

##### S.Result.result({ ok: t1, error: t2 })
A (experimental) portal for a 'success or failure' type, allowing a means of passing
exceptional conditions across serialization boundaries in a type-safe manner.

Consult [result.test.ts](./src/result.test.ts) for example usage.
    

#### Using composite types

You can build type-portals for types like tuples, arrays and objects:

```TSX
const personPortal = S.obj({
	name: S.str,
	date_of_birth: S.dateIso,
	date_of_death: S.optional(S.dateIso),
	favourite_foods: S.array(S.str)
});

personPortal.write({
	name: 'Bob',
	date_of_birth: new Date(1985, 10, 15),
	date_of_death: undefined,
	favourite_foods: ['pizza', 'broccoli']
});
```

For javascript users, you get validation. For Typescript users you also get
type hints in argument value of write, and return value of read:

```TSX
const person = personPortal.read(data);
person.date_of_death.getYear()
                    ^-- type error: value could be undefined
```

### HTTP use case (example in ExpressJS)

We can use the following function to define HTTP endpoints in terms of
url prefix, arguments and response types:

```TSX
export interface Endpoint<Args,Resp> {
  url: string,
  argumentType: S.Type<Args>,
  responseType: S.Type<Resp>,
  call: (args: Args) => Promise<Resp>
}

export function makeEndpoint<Args, Resp>(
  url: string,
  argumentType: S.Type<Args>,
  responseType: S.Type<Resp>
): Endpoint<Args, Resp>
{
  return {
    url,
    argumentType,
    responseType,
    call: async (args: Args): Promise<Resp> => {
      const resp = await axios.post(url, { args: argumentType.write(args) });
      return responseType.read(resp.data.result);
    },
  }
}
```

Then, in code shared by both the HTTP back-end and by the front-end, we can
define our endpoints like so:

```TSX
export const savePerson = makeEndpoint(
  '/admin/api/journey/save',
  // arguments
  S.obj({
	guid: S.str,
	name: S.str,
	date_of_birth: S.dateIso,
	date_of_death: S.optional(S.dateIso),
	favourite_foods: S.array(S.str)
  }),
  // response (either success (nothing) or an error string)
  S.obj({
    error: S.optional(S.str)
  })
)
```

Front-end code can import the above endpoint definition, and make HTTP calls
in a way that looks and behaves like any asynchronous typescript function
call:

```TSX
const response = await savePerson.call(person);
if (response.error) {
```

The arguments and return type of call will of course be statically validated,
removing cognitive load on the developer.

The back-end implementation could be implemented using the following utility
function (its separation from makeEndpoint ensures that ExpressJS doesn't
become a front-end dependency!):

```TSX
export function endpointHandler<Args, Resp>(
  app: express.Application,
  endpoint: Endpoint<Args, Resp>,
  handler: (args: Args) => Promise<Resp>,
)
{
    app.post(endpoint.url, async (req, resp): Promise<void> => {
      try {
        resp.send({
          result: endpoint.responseType.write(
            await handler(endpoint.argumentType.read(req.body.args))
          )
        });
      } catch (e) {
        resp.sendStatus(500);
        throw e;
      }
    });
}
```

And the actual endpoint implementation in your controller code will simply be:

```TSX
endpointHandler(
  app, // expressJS app instance
  savePerson, // the handler definition created previously
  async person => {
    // person will be correctly typed
    // note that we didn't need to annotate the type here
    const error = Person.save(person)
    return { error }
  }
);
```

Once again, the arguments and return type from the `async person => {`
function will be validated and checked, and provide IDE feedback.

Now changes to endpoint URIs, changes to argument shape and validation, and
changes to response type become safe operations - you can refactor freely,
and the compiler or IDE will keep track of the details.
