/**
 * PATCH_21: Admin Blog Routes
 * Protected routes for blog management
 */

const express = require("express");
const router = express.Router();
const blogsController = require("../controllers/blogs.controller");

// All routes here are already protected by admin middleware in app.js

// GET /api/admin/blogs - List all blogs (including drafts)
router.get("/", blogsController.getAllBlogsAdmin);

// GET /api/admin/blogs/:id - Get single blog by ID
router.get("/:id", blogsController.getBlogByIdAdmin);

// POST /api/admin/blogs - Create new blog
router.post("/", blogsController.createBlog);

// PUT /api/admin/blogs/:id - Update blog
router.put("/:id", blogsController.updateBlog);

// DELETE /api/admin/blogs/:id - Delete blog
router.delete("/:id", blogsController.deleteBlog);

module.exports = router;
