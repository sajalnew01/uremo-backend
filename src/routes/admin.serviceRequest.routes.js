const router = require("express").Router();

const auth = require("../middlewares/auth.middleware");
const admin = require("../middlewares/admin.middleware");

const AdminServiceRequestController = require("../controllers/admin.serviceRequest.controller");

router.use(auth, admin);

router.get("/", AdminServiceRequestController.listServiceRequests);
router.get("/:id", AdminServiceRequestController.getServiceRequestById);
router.put("/:id", AdminServiceRequestController.updateServiceRequest);
router.delete("/:id", AdminServiceRequestController.deleteServiceRequest);

module.exports = router;
