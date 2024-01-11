const test = require("node:test");
const assert = require("node:assert/strict");
const { getUser } = require("../queries"); // Adjust the path accordingly
const UserModel = require("../model"); // Import your actual user model

// Mock UserModel
const mockUserModel = {
    findById: async (id) => {
        // Mock user object with the specified fields
        return {
            _id: id,
            email: "mock@example.com",
            active: true,
            name: "Mock User",
        };
    },
};

test("should return a valid userId", async (t) => {
    const validUserId = "12345abcd";

    const user = await mockUserModel.findById(validUserId);

    const result = await getUser(validUserId);
    assert.strictEqual(typeof result.id, "string", "UserId should be a string");
    assert.deepStrictEqual(result.id, user.id);
});

test("should return a invalid userId", async (t) => {
    const validUserId = "12345efgh";

    const user = await mockUserModel.findById(validUserId);

    const result = await getUser(validUserId);
    // assert.strictEqual(retrievedUser.id, existingUserId);
    assert.notDeepStrictEqual(result.id, user.id);
});

// describe('getUser function', () => {
//   it('should return a user when a valid ID is provided', async () => {
//     // Arrange
//     const userId = 'validUserId';

//     // Mock the findById method
//     const originalFindById = UserModel.findById;
//     UserModel.findById = async (id) => mockUserModel.findById(id);

//     // Act
//     const result = await getUser(userId);

//     // Assert
//     assert.deepStrictEqual(result, {
//       _id: userId,
//       email: 'mock@example.com',
//       active: true,
//       name: 'Mock User',
//     });

//     // Restore the original method
//     UserModel.findById = originalFindById;
//   });

//   it('should return null when an invalid ID is provided', async () => {
//     // Arrange
//     const invalidUserId = 'invalidUserId';

//     // Mock the findById method
//     const originalFindById = UserModel.findById;
//     UserModel.findById = async (id) => null;

//     // Act
//     const result = await getUser(invalidUserId);

//     // Assert
//     assert.strictEqual(result, null);

//     // Restore the original method
//     UserModel.findById = originalFindById;
//   });

//   it('should handle errors and reject the promise', async () => {
//     // Arrange
//     const errorUserId = 'errorUserId';
//     const errorMessage = 'An error occurred';

//     // Mock the findById method
//     const originalFindById = UserModel.findById;
//     UserModel.findById = async (id) => {
//       throw new Error(errorMessage);
//     };

//     // Act & Assert
//     await assert.rejects(async () => await getUser(errorUserId), { message: errorMessage });

//     // Restore the original method
//     UserModel.findById = originalFindById;
//   });
// });
