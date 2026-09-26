jest.mock('expo-sqlite', () => ({
  NativeDatabase: jest.fn().mockImplementation(() => ({})),
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    withTransactionAsync: jest.fn(async (callback) => callback()),
    closeAsync: jest.fn(async () => undefined),
  })),
}));
