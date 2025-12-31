import express from "express";

import User from "../../controllers/controller_teste";
import PendingIssues from "../../controllers/pendingIssues.controller";

import { hasUserData } from "../../middlewares/Users/userData";
import { validateKeys } from "../../middlewares/Users/validateKeys";
import { validatePending } from "../../middlewares/Users/validatePending";
import { validateRegister } from "../../middlewares/Users/validateRegister";

const routes = express.Router();

// * Rotas CRUD User
routes.post("/login", hasUserData, User.authUser);
routes.post("/register", validateRegister, User.registerUser);
routes.get("/user/id", User.findUser);
routes.get("/user/email", User.findUser);
routes.get("/active", User.findActiveUsers);
routes.patch("/update", validateKeys, User.updateUser);
routes.patch("/update/password", User.updateUserPass);

// * Rotas CRUD User.pendingIssues (Pendências)
routes.get("/pendingissues", PendingIssues.findPendingIssue);
routes.patch(
  "/pendingissues/register",
  validatePending,
  PendingIssues.registerPendingIssue
);
routes.patch("/pendingissues/remove", PendingIssues.deletePendingIssue);
routes.patch("/pendingissues/update", PendingIssues.updatePendingIssue);

export default routes;
