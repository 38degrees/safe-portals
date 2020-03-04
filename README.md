# Safe Portals

### Type-safe, validated, composable serialization/unserialization

#### Basics

Safe-portals can be used wherever data traverses an un-typed boundary
(eg from DB, tasks sent to resque, HTTP calls, routing information in
URLs), in order to maintain static analysis across the un-typed boundary.

You usually want to import the whole library:

```TSX
import * as Safe from 'safe-portals';
```

A safe-portal describes both the serialization and unserialization operation
for a particular type, bridging the gap between arbitrary typed values (like
JS Dates, or custom interfaces) and JSONable JS objects (ie only string, number,
boolean, null, arrays of these types, and objects indexed by strings and
containing only these types). For example:

```TSX
Safe.date
```

Is a safe-portal for a date object. The unserialization operation is called
'read':

```TSX
Safe.date.read("2020-03-04T12:27:41.360Z")
> Date Wed Mar 04 2020 12:27:41 GMT+0000 (Greenwich Mean Time)
```

The serialization operation is the other side of the
serialization/unserialization symmetry:

```TSX
Safe.date.write(new Date())
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

#### Composite types

You can build type-portals for types like tuples, arrays and objects:

```TSX
const personPortal = Safe.obj({
	name: Safe.str,
	date_of_birth: Safe.date,
	date_of_death: Safe.optional(Safe.date),
	favourite_foods: Safe.array(Safe.str)
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
  argumentType: Safe.Type<Args>,
  responseType: Safe.Type<Resp>,
  call: (args: Args) => Promise<Resp>
}

export function makeEndpoint<Args, Resp>(
  url: string,
  argumentType: Safe.Type<Args>,
  responseType: Safe.Type<Resp>
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
  Safe.obj({
	guid: Safe.str,
	name: Safe.str,
	date_of_birth: Safe.date,
	date_of_death: Safe.optional(Safe.date),
	favourite_foods: Safe.array(Safe.str)
  }),
  // response (either success (nothing) or an error string)
  Safe.obj({
    error: Safe.optional(Safe.str)
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
