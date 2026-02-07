# Test-Driven Development Policy

## 🎯 Rule: Tests First, Implementation Second

**All new features and bug fixes MUST follow TDD:**

1. ✅ **Write failing tests first**
2. ✅ **Implement minimal code to make tests pass**
3. ✅ **Refactor while keeping tests green**

## 📝 TDD Workflow

### Step 1: Write Tests
```bash
# Create/update test file
# Write test cases for the feature
# Run tests - they should FAIL
bun test
```

### Step 2: Implement Feature
```bash
# Write minimal code to pass tests
# Run tests - they should PASS
bun test
```

### Step 3: Refactor
```bash
# Clean up code
# Run tests - they should still PASS
bun test
```

## 🧪 What to Test

### ✅ MUST Test:
- **Utility functions** - All pure functions in `src/utils.ts`
- **Business logic** - Domain selection, validation, URL building
- **Data transformations** - Container processing, filtering
- **Edge cases** - null values, empty strings, invalid input

### ⚠️ MAY Skip (for now):
- **UI/Template rendering** - Complex to test
- **External API calls** - Mock/stub instead
- **Cache manager internals** - Integration tests preferred

## 📊 Current Test Coverage

**Files with good coverage:**
- ✅ `src/utils.ts` - 44 tests covering all validation and domain functions

**Files needing tests:**
- ❌ `src/cache.ts` - Auto-creation logic, domain tracking
- ❌ `src/npm-client.ts` - API methods (requires mocking)
- ❌ `src/dockhand-client.ts` - API methods (requires mocking)

## 🚨 Enforcement

**Before merging to main:**
1. All new features MUST have tests
2. `bun test` MUST pass
3. GitHub Actions CI MUST be green

**Exceptions:**
- Emergency hotfixes (document why tests were skipped)
- Proof-of-concept / experimental code (in feature branch)

## 📚 Resources

- **Test Framework**: Bun's built-in test runner
- **Test Location**: `src/*.test.ts` (alongside source files)
- **Run Tests**: `bun test`
- **Run Single File**: `bun test src/utils.test.ts`

## 🎯 Example: TDD for buildContainerUrl Priority

### Step 1: Write Test (BEFORE implementation)
```typescript
// src/utils.test.ts
describe('buildContainerUrl with auto-created domain', () => {
  test('auto-created domain takes priority over IP:port', () => {
    const container = { /* ... */ };
    const url = buildContainerUrl(
      container,
      8080,
      '192.168.1.100',
      null,
      [],
      'app.example.com' // auto-created domain
    );
    expect(url).toBe('https://app.example.com');
  });

  test('custom URL takes priority over auto-created domain', () => {
    const container = {
      labels: { 'dockhand-tavern.url': 'https://custom.com' }
    };
    const url = buildContainerUrl(
      container,
      8080,
      '192.168.1.100',
      null,
      [],
      'app.example.com' // auto-created domain
    );
    expect(url).toBe('https://custom.com'); // Custom wins
  });
});
```

### Step 2: Run Tests (should FAIL)
```bash
$ bun test
❌ Test failed: auto-created domain takes priority over IP:port
Expected: 'https://app.example.com'
Received: 'http://192.168.1.100:8080'
```

### Step 3: Implement Feature
```typescript
// Add auto-created domain priority to buildContainerUrl()
if (autoCreatedDomain) {
  return `https://${autoCreatedDomain}`;
}
```

### Step 4: Run Tests (should PASS)
```bash
$ bun test
✅ All tests passed
```

## 💡 Future Improvements

1. **Add integration tests** for cache manager
2. **Add tests for NPM client** (with mocked API responses)
3. **Add tests for container processing** workflow
4. **Track code coverage** (when Bun supports it)
5. **Add E2E tests** (optional, for critical flows)

## ✅ Commitment

**Going forward, all features will follow TDD.**

If you see a PR without tests, reject it and request TDD! 🚫
