'use strict';

const client = require('prom-client');

// ──────────────────────────────────────────────────────────────────────────────
// Per-operation Prometheus counters
// These are registered once at module load; prom-client deduplicates by name.
// ──────────────────────────────────────────────────────────────────────────────
const taskOperationsTotal = new client.Counter({
  name: 'task_operations_total',
  help: 'Total number of task CRUD operations',
  labelNames: ['operation', 'status'],  // e.g. create/success, delete/not_found
});

// In-memory task store (DB disabled; would be replaced by Mongoose queries)
let tasks = [
  { id: '1', title: 'Learn Jest',       completed: false },
  { id: '2', title: 'Write unit tests', completed: true  },
];

// ──────────────────────────────────────────────────────────────────────────────
// GET /tasks  — list all tasks
// ──────────────────────────────────────────────────────────────────────────────
const fetchAllTasks = (req, res) => {
  taskOperationsTotal.inc({ operation: 'read', status: 'success' });
  res.status(200).json(tasks);
};

// ──────────────────────────────────────────────────────────────────────────────
// POST /tasks  — create a task
// ──────────────────────────────────────────────────────────────────────────────
const createTask = (req, res) => {
  const { title } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    taskOperationsTotal.inc({ operation: 'create', status: 'bad_request' });
    return res.status(400).json({ message: 'title is required and must be a non-empty string' });
  }

  const newTask = {
    id:        String(tasks.length + 1),
    title:     title.trim(),
    completed: false,
  };

  tasks.push(newTask);
  taskOperationsTotal.inc({ operation: 'create', status: 'success' });
  req.log && req.log.info({ taskId: newTask.id }, 'Task created');
  res.status(201).json(newTask);
};

// ──────────────────────────────────────────────────────────────────────────────
// PUT /tasks/:id  — update a task
// ──────────────────────────────────────────────────────────────────────────────
const updateTaskById = (req, res) => {
  const { id } = req.params;
  const task = tasks.find(t => t.id === id);

  if (!task) {
    taskOperationsTotal.inc({ operation: 'update', status: 'not_found' });
    return res.status(404).json({ message: 'Task not found' });
  }

  task.title     = req.body.title     ?? task.title;
  task.completed = req.body.completed ?? task.completed;

  taskOperationsTotal.inc({ operation: 'update', status: 'success' });
  req.log && req.log.info({ taskId: id }, 'Task updated');
  res.status(200).json(task);
};

// ──────────────────────────────────────────────────────────────────────────────
// DELETE /tasks/:id  — delete a task
// ──────────────────────────────────────────────────────────────────────────────
const deleteTaskById = (req, res) => {
  const { id } = req.params;
  const index = tasks.findIndex(t => t.id === id);

  if (index === -1) {
    taskOperationsTotal.inc({ operation: 'delete', status: 'not_found' });
    return res.status(404).json({ message: 'Task not found' });
  }

  const [deletedTask] = tasks.splice(index, 1);
  taskOperationsTotal.inc({ operation: 'delete', status: 'success' });
  req.log && req.log.info({ taskId: id }, 'Task deleted');
  res.status(200).json(deletedTask);
};

module.exports = { createTask, fetchAllTasks, updateTaskById, deleteTaskById };
