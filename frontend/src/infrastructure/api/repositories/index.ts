// Infrastructure API Repositories
// Implementations of core port interfaces

// Core Repositories
export * from "./problem.repository";
export * from "./submission.repository";
export * from "./contest.repository";
export * from "./discussion.repository";
export * from "./auth.repository";
export * from "./announcement.repository";
export * from "./database.repository";

// Contest Sub-Repositories
export * from "./contestProblems.repository";
export * from "./contestParticipants.repository";
export * from "./exam.repository";
export * from "./contestQuestions.repository";
export * from "./clarification.repository";
export * from "./contestAnnouncements.repository";
export * from "./contestAdmins.repository";
export * from "./contestExports.repository";

// Repository Instances
export { default as problemRepository } from "./problem.repository";
export { default as submissionRepository } from "./submission.repository";
export { default as contestRepository } from "./contest.repository";
export { default as discussionRepository } from "./discussion.repository";
export { default as authRepository } from "./auth.repository";
export { default as announcementRepository } from "./announcement.repository";
export { databaseService } from "./database.repository";
