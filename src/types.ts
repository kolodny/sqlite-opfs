import type { SqlValue } from '@sqlite.org/sqlite-wasm';

export type Cloneable =
	| { [key: string]: Cloneable }
	| Cloneable[]
	| Map<unknown, Cloneable>
	| Set<Cloneable>
	| Promise<Cloneable>
	// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
	| void
	| ArrayBuffer
	| boolean
	| DataView
	| Date
	| Error
	| string
	| number
	| null
	| undefined
	| bigint
	// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
	| BigInt
	| RegExp
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array;

export type BaseSelect =
	| []
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	| [{}]
	| string[]
	| [string[]]
	| number[]
	| [number[]];

export type RowType<Select extends BaseSelect> = Select extends []
	? Record<string, SqlValue>
	: // eslint-disable-next-line @typescript-eslint/no-empty-object-type
		Select extends [{}]
		? Record<string, SqlValue>
		: Select extends string[]
			? Record<Select[number], SqlValue>
			: Select extends [string[]]
				? SqlValue[]
				: Select extends number[]
					? SqlValue[]
					: Select extends [number[]]
						? SqlValue[]
						: SqlValue[];
