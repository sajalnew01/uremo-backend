const router = require("express").Router();

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const {
  listAdmin,
  create,
  update,
  remove,
} = require("../controllers/workPosition.controller");

router.get("/", auth, admin, listAdmin);
router.post("/", auth, admin, create);
router.put("/:id", auth, admin, update);
router.delete("/:id", auth, admin, remove);

module.exports = router;
