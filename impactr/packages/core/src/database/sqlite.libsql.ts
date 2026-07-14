import { createClient } from "@libsql/client"
import type { InArgs } from "@libsql/client"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Stream from "effect/Stream"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import * as Client from "effect/unstable/sql/SqlClient"
import type { Connection } from "effect/unstable/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/unstable/sql/SqlError"
import * as Statement from "effect/unstable/sql/Statement"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

export interface Config {
  readonly url: string
  readonly authToken?: string
  readonly spanAttributes?: Record<string, unknown>
  readonly transformResultNames?: (str: string) => string
  readonly transformQueryNames?: (str: string) => string
}

const make = (options: Config) =>
  Effect.gen(function* () {
    const native = createClient({ url: options.url, authToken: options.authToken })
    yield* Effect.addFinalizer(() => Effect.sync(() => native.close()))

    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined

    const run = (query: string, params: ReadonlyArray<unknown> = []) =>
      Effect.tryPromise({
        try: () => native.execute({ sql: query, args: params as unknown as InArgs }),
        catch: (cause) =>
          new SqlError({
            reason: classifySqliteError(cause, { message: "Failed to execute statement", operation: "execute" }),
          }),
      }).pipe(
        Effect.map((result) =>
          result.rows.map((row) =>
            Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
          ),
        ),
      )

    const runValues = (query: string, params: ReadonlyArray<unknown> = []) =>
      Effect.tryPromise({
        try: () => native.execute({ sql: query, args: params as unknown as InArgs }),
        catch: (cause) =>
          new SqlError({
            reason: classifySqliteError(cause, { message: "Failed to execute statement", operation: "execute" }),
          }),
      }).pipe(Effect.map((result) => result.rows.map((row) => Array.from({ length: result.columns.length }, (_, index) => row[index]))))

    const connection = identity<Connection>({
      execute(query, params, transformRows) {
        return transformRows ? Effect.map(run(query, params), transformRows) : run(query, params)
      },
      executeRaw(query, params) {
        return run(query, params)
      },
      executeValues(query, params) {
        return runValues(query, params)
      },
      executeUnprepared(query, params, transformRows) {
        return this.execute(query, params, transformRows)
      },
      executeStream() {
        return Stream.die("executeStream not implemented for libsql")
      },
    })

    // A single semaphore-guarded connection keeps every statement — including the literal
    // BEGIN/SAVEPOINT/COMMIT text the generic transaction machinery issues — ordered on the
    // same underlying libsql session, which is required for transactional state to hold
    // across statements on a remote (Hrana) connection.
    const semaphore = yield* Semaphore.make(1)
    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection))
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!
      const scope = Context.getUnsafe(fiber.context, Scope.Scope)
      return Effect.as(
        Effect.tap(restore(semaphore.take(1)), () => Scope.addFinalizer(scope, semaphore.release(1))),
        connection,
      )
    })

    const client = yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      spanAttributes: [
        ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
        [ATTR_DB_SYSTEM_NAME, "sqlite"],
      ],
      transformRows,
    })

    return client
  })

const sqliteLayer = (config: Config) => Layer.effect(Client.SqlClient, make(config))

/**
 * SafeIntegers is not honored here: unlike bun:sqlite's per-statement toggle, libsql's
 * client only supports a fixed intMode at connection creation, so hosted rows always
 * decode integers as JS numbers.
 */
export const layer = (config: Config) => sqliteLayer(config).pipe(Layer.provide(Reactivity.layer))
