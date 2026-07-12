import path from "path"

process.env.IMPACTR_DB = ":memory:"
process.env.IMPACTR_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.IMPACTR_DISABLE_MODELS_FETCH = "true"
