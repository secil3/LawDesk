import TaskPanel from "../../components/TaskPanel";

function TasksPage({ taskPanelRevision }) {
  return (
    <section className="page-shell">
      <TaskPanel refreshKey={taskPanelRevision} />
    </section>
  );
}

export default TasksPage;
