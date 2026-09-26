class NativeDatabaseMock {
  constructor(..._args: unknown[]) {}
}

const expoSQLite = {
  NativeDatabase: NativeDatabaseMock,
};

export default expoSQLite;
