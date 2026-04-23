import { Response, NextFunction } from 'express';
import {
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
  listTaskActivities,
  addTaskActivity,
} from './tasks.service';
import { sendSuccess, sendCreated, sendError, buildPaginationMeta, sendPaginated } from '../../utils/apiResponse';
import { AuthRequest } from '../../types/express';
import { logAudit } from '../../services/auditService';

export async function getTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tasks, total, page, limit } = await listTasks(req);
    const pagination = buildPaginationMeta(total, page, limit);
    sendPaginated(res, tasks, pagination);
  } catch (err) {
    next(err);
  }
}

export async function getTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await getTaskById(req.params.id);
    sendSuccess(res, task);
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createTaskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await createTask(req.body, req.user?.id);
    logAudit(req, 'CREATE', 'Task', task.id, null, { id: task.id, title: task.title });
    sendCreated(res, task, 'Task created successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateTaskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await updateTask(req.params.id, req.body);
    logAudit(req, 'UPDATE', 'Task', task.id, null, req.body);
    sendSuccess(res, task, 'Task updated successfully');
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else {
      next(err);
    }
  }
}

export async function completeTaskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await completeTask(req.params.id, req.user?.id);
    logAudit(req, 'COMPLETE', 'Task', task.id);
    sendSuccess(res, task, 'Task completed successfully');
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else if ((err as Error).message === 'Task is already completed') {
      sendError(res, 'Task is already completed', 400);
    } else {
      next(err);
    }
  }
}

export async function reopenTaskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await reopenTask(req.params.id, req.user?.id);
    logAudit(req, 'REOPEN', 'Task', task.id);
    sendSuccess(res, task, 'Task marked as incomplete');
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else if ((err as Error).message === 'Task is not completed') {
      sendError(res, 'Task is not completed', 400);
    } else {
      next(err);
    }
  }
}

export async function getTaskActivitiesHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const activities = await listTaskActivities(req.params.id);
    sendSuccess(res, activities);
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else {
      next(err);
    }
  }
}

export async function createTaskActivityHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const activity = await addTaskActivity(req.params.id, req.body, req.user?.id);
    logAudit(req, 'CREATE', 'TaskActivity', activity.id, null, { taskId: req.params.id, ...req.body });
    sendCreated(res, activity, 'Activity added');
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else {
      next(err);
    }
  }
}

export async function deleteTaskHandler(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteTask(req.params.id);
    logAudit(req, 'DELETE', 'Task', req.params.id);
    sendSuccess(res, null, 'Task deleted successfully');
  } catch (err) {
    if ((err as Error).message === 'Task not found') {
      sendError(res, 'Task not found', 404);
    } else {
      next(err);
    }
  }
}
