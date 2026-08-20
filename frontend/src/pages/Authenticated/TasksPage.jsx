import TaskPanel from "../../components/TaskPanel";

function TasksPage({ taskPanelRevision, onNavigate }) {
  return (
    <section className="page-shell">
      <TaskPanel refreshKey={taskPanelRevision} onNavigate={onNavigate} />
    </section>
  );
}

export default TasksPage;
