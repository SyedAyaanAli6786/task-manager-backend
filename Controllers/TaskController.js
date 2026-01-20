let tasks = [
    {
        id: "1",
        title: "Learn Jest",
        completed: false
    },
    {
        id: "2",
        title: "Write unit tests",
        completed: true
    }
];

// GET /tasks
const fetchAllTasks = (req, res) => {
    res.status(200).json(tasks);
};

// POST /tasks
const createTask = (req, res) => {
    const newTask = {
        id: String(tasks.length + 1),
        title: req.body.title,
        completed: false
    };

    tasks.push(newTask);
    res.status(201).json(newTask);
};

// PUT /tasks/:id
const updateTaskById = (req, res) => {
    const { id } = req.params;
    const task = tasks.find(t => t.id === id);

    if (!task) {
        return res.status(404).json({ message: 'Task not found' });
    }

    task.title = req.body.title ?? task.title;
    task.completed = req.body.completed ?? task.completed;

    res.status(200).json(task);
};

// DELETE /tasks/:id
const deleteTaskById = (req, res) => {
    const { id } = req.params;
    const index = tasks.findIndex(t => t.id === id);

    if (index === -1) {
        return res.status(404).json({ message: 'Task not found' });
    }

    const deletedTask = tasks.splice(index, 1);
    res.status(200).json(deletedTask[0]);
};

module.exports = {
    createTask,
    fetchAllTasks,
    updateTaskById,
    deleteTaskById
};
