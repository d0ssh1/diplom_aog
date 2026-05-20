ERROR:    Exception in ASGI application
Traceback (most recent call last):
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
    ~~~~~~~~~~~~~~~~~~~~~~~^
        cursor, str_statement, effective_parameters, context
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
    ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 182, in execute
    self._adapt_connection._handle_exception(error)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 342, in _handle_exception
    raise error
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 164, in execute
    self.await_(_cursor.execute(operation, parameters))
    ~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\util\_concurrency_py3k.py", line 132, in await_only
    return current.parent.switch(awaitable)  # type: ignore[no-any-return,attr-defined] # noqa: E501
           ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\util\_concurrency_py3k.py", line 196, in greenlet_spawn
    value = await result
            ^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\cursor.py", line 40, in execute
    await self._execute(self._cursor.execute, sql, parameters)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\cursor.py", line 32, in _execute
    return await self._conn._execute(fn, *args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\core.py", line 160, in _execute
    return await future
           ^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\core.py", line 63, in _connection_worker_thread
    result = function()
sqlite3.OperationalError: no such column: reconstructions.building_id

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\uvicorn\protocols\http\h11_impl.py", line 410, in run_asgi
    result = await app(  # type: ignore[func-returns-value]
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        self.scope, self.receive, self.send
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\uvicorn\middleware\proxy_headers.py", line 60, in __call__
    return await self.app(scope, receive, send)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\applications.py", line 1135, in __call__
    await super().__call__(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\applications.py", line 107, in __call__
    await self.middleware_stack(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\middleware\errors.py", line 186, in __call__
    raise exc
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\middleware\errors.py", line 164, in __call__
    await self.app(scope, receive, _send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\middleware\cors.py", line 85, in __call__
    await self.app(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\middleware\exceptions.py", line 63, in __call__
    await wrap_app_handling_exceptions(self.app, conn)(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\middleware\asyncexitstack.py", line 18, in __call__
    await self.app(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\routing.py", line 716, in __call__
    await self.middleware_stack(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\routing.py", line 736, in app
    await route.handle(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\routing.py", line 290, in handle
    await self.app(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\routing.py", line 115, in app
    await wrap_app_handling_exceptions(app, request)(scope, receive, send)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\_exception_handler.py", line 53, in wrapped_app
    raise exc
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\starlette\_exception_handler.py", line 42, in wrapped_app
    await app(scope, receive, sender)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\routing.py", line 101, in app
    response = await f(request)
               ^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\routing.py", line 355, in app
    raw_response = await run_endpoint_function(
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ...<3 lines>...
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\fastapi\routing.py", line 243, in run_endpoint_function
    return await dependant.call(**values)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\app\api\reconstruction.py", line 129, in get_reconstructions
    reconstructions = await svc.get_saved_reconstructions()
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\app\services\reconstruction_service.py", line 274, in get_saved_reconstructions
    return await self._repo.get_saved()
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\app\db\repositories\reconstruction_repo.py", line 159, in get_saved
    result = await self._session.execute(query)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\ext\asyncio\session.py", line 449, in execute
    result = await greenlet_spawn(
             ^^^^^^^^^^^^^^^^^^^^^
    ...<6 lines>...
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\util\_concurrency_py3k.py", line 201, in greenlet_spawn
    result = context.throw(*sys.exc_info())
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\orm\session.py", line 2351, in execute
    return self._execute_internal(
           ~~~~~~~~~~~~~~~~~~~~~~^
        statement,
        ^^^^^^^^^^
    ...<4 lines>...
        _add_event=_add_event,
        ^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\orm\session.py", line 2249, in _execute_internal
    result: Result[Any] = compile_state_cls.orm_execute_statement(
                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        self,
        ^^^^^
    ...<4 lines>...
        conn,
        ^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\orm\context.py", line 306, in orm_execute_statement
    result = conn.execute(
        statement, params or {}, execution_options=execution_options
    )
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1419, in execute
    return meth(
        self,
        distilled_parameters,
        execution_options or NO_OPTIONS,
    )
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\sql\elements.py", line 527, in _execute_on_connection
    return connection._execute_clauseelement(
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        self, distilled_params, execution_options
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1641, in _execute_clauseelement
    ret = self._execute_context(
        dialect,
    ...<8 lines>...
        cache_hit=cache_hit,
    )
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1846, in _execute_context
    return self._exec_single_context(
           ~~~~~~~~~~~~~~~~~~~~~~~~~^
        dialect, context, statement, parameters
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1986, in _exec_single_context
    self._handle_dbapi_exception(
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~^
        e, str_statement, effective_parameters, cursor, context
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 2363, in _handle_dbapi_exception
    raise sqlalchemy_exception.with_traceback(exc_info[2]) from e
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\base.py", line 1967, in _exec_single_context
    self.dialect.do_execute(
    ~~~~~~~~~~~~~~~~~~~~~~~^
        cursor, str_statement, effective_parameters, context
        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    )
    ^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\engine\default.py", line 952, in do_execute
    cursor.execute(statement, parameters)
    ~~~~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 182, in execute
    self._adapt_connection._handle_exception(error)
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 342, in _handle_exception
    raise error
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\dialects\sqlite\aiosqlite.py", line 164, in execute
    self.await_(_cursor.execute(operation, parameters))
    ~~~~~~~~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\util\_concurrency_py3k.py", line 132, in await_only
    return current.parent.switch(awaitable)  # type: ignore[no-any-return,attr-defined] # noqa: E501
           ~~~~~~~~~~~~~~~~~~~~~^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\sqlalchemy\util\_concurrency_py3k.py", line 196, in greenlet_spawn
    value = await result
            ^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\cursor.py", line 40, in execute
    await self._execute(self._cursor.execute, sql, parameters)
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\cursor.py", line 32, in _execute
    return await self._conn._execute(fn, *args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\core.py", line 160, in _execute
    return await future
           ^^^^^^^^^^^^
  File "C:\DIPLOM\diplom_aog\backend\venv\Lib\site-packages\aiosqlite\core.py", line 63, in _connection_worker_thread
    result = function()
sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: reconstructions.building_id
[SQL: SELECT reconstructions.id, reconstructions.name, reconstructions.plan_file_id, reconstructions.mask_file_id, reconstructions.mesh_file_id_obj, reconstructions.mesh_file_id_glb, reconstructions.building_id, reconstructions.floor_number, reconstructions.status, reconstructions.error_message, reconstructions.vectorization_data, reconstructions.created_by, reconstructions.created_at, reconstructions.updated_at
FROM reconstructions
WHERE reconstructions.name IS NOT NULL ORDER BY reconstructions.created_at DESC]
(Background on this error at: https://sqlalche.me/e/20/e3q8)