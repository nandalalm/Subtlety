import Admin from "../model/admin.js";

class AdminRepository {
async findOne(query) {
    return await Admin.findOne(query);
  }
}

export default new AdminRepository();
