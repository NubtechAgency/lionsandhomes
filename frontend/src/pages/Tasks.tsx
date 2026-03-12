import { ListTodo } from 'lucide-react';

export default function Tasks() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tareas</h1>
        <p className="text-gray-500 text-sm mb-8">Gestión de tareas por proyecto</p>

        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <ListTodo size={56} className="mx-auto text-gray-300 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Próximamente</h2>
          <p className="text-gray-400 max-w-md mx-auto">
            Aquí podrás gestionar tareas con vista Kanban, asignarlas a proyectos y hacer seguimiento del progreso de cada reforma.
          </p>
        </div>
      </div>
    </div>
  );
}
