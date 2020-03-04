# Safe Portals

### Type-safe, validated, composable serialization/unserialization

#### Basics

Safe-portals can be used wherever data traverses an un-typed boundary
(eg from DB, tasks sent to resque, HTTP calls, routing information in
URLs), in order to maintain static analysis across the un-typed boundary.

You usually want to import the whole library:

```
import * as Safe from 'safe-portals';
```

A safe-portal describes both the serialization and unserialization operation
for a particular type, bridging the gap between arbitrary typed values (like
JS Dates, or custom interfaces) and JSONable JS objects (ie only string, number,
boolean, null, arrays of these types, and objects indexed by strings and
containing only these types). For example:

```
Safe.date
```

Is a safe-portal for a date object. The unserialization operation is called
'read':

```
Safe.date.read("2020-03-04T12:27:41.360Z")
> Date Wed Mar 04 2020 12:27:41 GMT+0000 (Greenwich Mean Time)
```

The serialization operation is the other side of the
serialization/unserialization symmetry:

```
Safe.date.write(new Date())
> "2020-03-04T12:27:41.360Z"
```

Note that the safe-portal 'write' operation doesn't generate JSON -- it
generates JSONifiable JS objects -- and the 'read' operation doesn't expect to
be passed JSON, but objects parsed from JSON (or otherwise JSONifiable
objects). This means that a typical usage across an un-typed interface (like
HTTP) will look like:

```
send(JSON.stringify(portal.write(value)));
```

and

```
portal.read(JSON.parse(receive()))
```

#### Composite types

You can build type-portals for types like tuples, arrays and objects:

```
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

```
const person = personPortal.read(data);
person.date_of_death.getYear()
                    ^-- type error: value could be undefined
```

