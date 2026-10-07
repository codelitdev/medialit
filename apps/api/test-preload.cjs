const buffer = require("buffer");

// jsonwebtoken -> jwa still reads SlowBuffer, which Node 26 removed.
if (!buffer.SlowBuffer) {
    buffer.SlowBuffer = buffer.Buffer;
}
