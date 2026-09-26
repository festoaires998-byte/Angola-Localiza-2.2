jest.mock('expo-sqlite', () => ({
  NativeDatabase: jest.fn().mockImplementation(() => ({})),
}));
