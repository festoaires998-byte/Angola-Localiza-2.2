class NativeDatabaseMock {
  constructor() {}
}

jest.mock('expo-sqlite', () => ({
  NativeDatabase: NativeDatabaseMock,
}));
