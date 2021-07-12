
Object.defineProperty(exports, "__esModule", { value: true });

function log() {
    // ignore
}

function createDebug(namespace) {
    return log;
}

exports.default = createDebug;
